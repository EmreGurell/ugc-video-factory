import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { ClaudeService } from '../pipeline/claude.service';
import { FfmpegService } from '../providers/ffmpeg/ffmpeg.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgGuard } from '../auth/org.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from '../auth/current-user.decorator';
import { CurrentOrg } from '../auth/current-org.decorator';
import type { OrgContext } from '../auth/current-org.decorator';

const TAG_MAX_LEN = 40;

function normalizeTag(tag?: string): string {
  const normalized = (tag ?? '').trim().toLowerCase();
  if (!normalized) throw new BadRequestException('tag is required');
  if (normalized.length > TAG_MAX_LEN) throw new BadRequestException(`tag too long (max ${TAG_MAX_LEN})`);
  return normalized;
}

function safeTagName(tag: string): string {
  return tag.replace(/[^a-z0-9çğıöşü_-]/gi, '_');
}

// Etiketli referans fotoğraf/video kütüphanesi — her etiket bir "klasör",
// birden fazla foto/video karesi tutabilir:
// POST   /references                multipart: image + tag → { tag, url, description }
// POST   /references/extract-frames multipart: video → { frames: string[] } (seçilecek adaylar)
// POST   /references/confirm-frame  json: { tag, frame_url } → { tag, url, description }
// GET    /references                → tüm kayıtlar (flat liste; mobil tag'e göre gruplar)
// DELETE /references/:tag           → o etiketin TÜM öğelerini siler
// DELETE /references/item/:id       → tek bir öğeyi siler
@Controller('references')
@UseGuards(JwtAuthGuard, OrgGuard)
export class ReferencesController {
  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly claude: ClaudeService,
    private readonly ffmpeg: FfmpegService,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const imageExts = /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i;
        if (!file.mimetype.startsWith('image/') && !imageExts.test(file.originalname)) {
          cb(new BadRequestException('Only image files are allowed'), false);
        } else {
          cb(null, true);
        }
      },
    }),
  )
  async upload(
    @CurrentUser() user: CurrentUserPayload,
    @CurrentOrg() org: OrgContext,
    @UploadedFile() file: Express.Multer.File,
    @Body('tag') tag?: string,
  ) {
    if (!file) throw new BadRequestException('No image file provided');
    const normalizedTag = normalizeTag(tag);

    const mimeType = file.mimetype.startsWith('image/') ? file.mimetype : 'image/jpeg';
    const url = await this.storage.uploadToStorage(
      file.buffer,
      `references/${safeTagName(normalizedTag)}/${Date.now()}.jpg`,
      mimeType,
    );

    return this.insertWithDescription(user.id, org.organizationId, normalizedTag, url);
  }

  // Videodan eşit aralıklarla kare adayları çıkarır ve storage'a yükler.
  // Kayıt henüz oluşturulmaz — kullanıcı birini seçip /confirm-frame çağırır.
  @Post('extract-frames')
  @UseInterceptors(
    FileInterceptor('video', {
      storage: memoryStorage(),
      limits: { fileSize: 150 * 1024 * 1024 }, // 150 MB
      fileFilter: (_req, file, cb) => {
        const videoExts = /\.(mp4|mov|m4v|webm|avi|mkv)$/i;
        if (!file.mimetype.startsWith('video/') && !videoExts.test(file.originalname)) {
          cb(new BadRequestException('Only video files are allowed'), false);
        } else {
          cb(null, true);
        }
      },
    }),
  )
  async extractFrames(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No video file provided');

    const frames = await this.ffmpeg.extractFrames(file.buffer, 10);
    const uploadId = Date.now();
    const urls = await Promise.all(
      frames.map((buf, i) =>
        this.storage.uploadToStorage(buf, `references/_candidates/${uploadId}-${i}.jpg`, 'image/jpeg'),
      ),
    );
    return { frames: urls };
  }

  // Kullanıcının video kare ızgarasından seçtiği kareyi kalıcı kayda dönüştürür.
  @Post('confirm-frame')
  async confirmFrame(
    @CurrentUser() user: CurrentUserPayload,
    @CurrentOrg() org: OrgContext,
    @Body('tag') tag?: string,
    @Body('frame_url') frameUrl?: string,
  ) {
    const normalizedTag = normalizeTag(tag);
    if (!frameUrl) throw new BadRequestException('frame_url is required');

    return this.insertWithDescription(user.id, org.organizationId, normalizedTag, frameUrl);
  }

  @Get()
  list(@CurrentOrg() org: OrgContext) {
    return this.db.listReferencePhotos(org.organizationId);
  }

  @Delete(':tag')
  async remove(@CurrentOrg() org: OrgContext, @Param('tag') tag: string) {
    await this.db.deleteReferencesByTag(tag.trim().toLowerCase(), org.organizationId);
    return { ok: true };
  }

  @Delete('item/:id')
  async removeItem(@CurrentOrg() org: OrgContext, @Param('id') id: string) {
    await this.db.deleteReferencePhotoById(id, org.organizationId);
    return { ok: true };
  }

  // Açıklama üretimi: otomatik tag eşleştirme ve prompt bağlamı bunu kullanır.
  // Analiz hatası kaydı engellemesin.
  private async insertWithDescription(userId: string, organizationId: string, tag: string, url: string) {
    let description: string | undefined;
    try {
      description = await this.claude.analyzeImage(url);
    } catch {
      description = undefined;
    }
    return this.db.insertReferencePhoto({ user_id: userId, organization_id: organizationId, tag, url, description });
  }
}
