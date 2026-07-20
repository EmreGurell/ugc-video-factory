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
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from '../auth/current-user.decorator';

@Controller('jobs')
@UseGuards(JwtAuthGuard)
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
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateJobDto) {
    return this.jobsService.create(user.id, dto);
  }

  @Get()
  findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.jobsService.findAll(user.id);
  }

  @Put(':id/approve-script')
  approveScript(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: { script: string },
  ) {
    return this.jobsService.approveScript(user.id, id, body.script);
  }

  @Get(':id')
  findOne(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.jobsService.findOne(user.id, id);
  }
}
