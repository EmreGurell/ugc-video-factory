import {
  Controller,
  Post,
  Put,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { StorageService } from '../storage/storage.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgGuard } from '../auth/org.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from '../auth/current-user.decorator';
import { CurrentOrg } from '../auth/current-org.decorator';
import type { OrgContext } from '../auth/current-org.decorator';

@Controller('jobs')
@UseGuards(JwtAuthGuard, OrgGuard)
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly storage: StorageService,
  ) {}

  @Post('upload-reference')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
      fileFilter: (_req, file, cb) => {
        const imageExts = /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i;
        const isMimeImage = file.mimetype.startsWith('image/');
        const isExtImage = imageExts.test(file.originalname);
        if (!isMimeImage && !isExtImage) {
          cb(new BadRequestException('Only image files are allowed'), false);
        } else {
          cb(null, true);
        }
      },
    }),
  )
  async uploadReference(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No image file provided');
    const path = `references/${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const mimeType = file.mimetype.startsWith('image/') ? file.mimetype : 'image/jpeg';
    const url = await this.storage.uploadToStorage(file.buffer, path, mimeType);
    return { url };
  }

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  create(@CurrentUser() user: CurrentUserPayload, @CurrentOrg() org: OrgContext, @Body() dto: CreateJobDto) {
    return this.jobsService.create(user.id, org.organizationId, dto);
  }

  @Get()
  findAll(@CurrentOrg() org: OrgContext) {
    return this.jobsService.findAll(org.organizationId);
  }

  @Put(':id/approve-script')
  approveScript(@CurrentOrg() org: OrgContext, @Param('id') id: string, @Body() body: { script: string }) {
    return this.jobsService.approveScript(org.organizationId, id, body.script);
  }

  @Get(':id')
  findOne(@CurrentOrg() org: OrgContext, @Param('id') id: string) {
    return this.jobsService.findOne(org.organizationId, id);
  }
}
