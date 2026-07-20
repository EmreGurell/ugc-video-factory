import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DatabaseService } from '../database/database.service';
import { CreateJobDto } from './dto/create-job.dto';

export const VIDEO_PIPELINE_QUEUE = 'video-pipeline';

@Injectable()
export class JobsService {
  constructor(
    private db: DatabaseService,
    @InjectQueue(VIDEO_PIPELINE_QUEUE) private queue: Queue,
  ) {}

  async create(userId: string, dto: CreateJobDto) {
    const job = await this.db.createJob({
      user_id: userId,
      product_name: dto.product_name,
      video_brief: dto.video_brief,
      prompt_character: dto.character_description,
      prompt_script: dto.script,
      aspect_ratio: dto.aspect_ratio ?? '9:16',
      content_type: dto.content_type ?? 'ugc_selfie',
      scene_count: dto.scene_count ?? 3,
      video_style: dto.video_style ?? 'dynamic',
      voice_language: dto.voice_language ?? 'tr',
      voice_gender: dto.voice_gender ?? 'female',
      reference_image_url: dto.reference_image_url,
      reference_tags: dto.reference_tags,
      music_mode: dto.music_mode ?? 'none',
      music_style: dto.music_style,
      image_model: dto.image_model,
      video_model: dto.video_model,
    });

    await this.queue.add('run', { jobId: job.id, phase: 1 }, { attempts: 1 });

    return { job_id: job.id };
  }

  async approveScript(userId: string, id: string, script: string) {
    const job = await this.db.getJobForUser(id, userId);
    if (job.status !== 'awaiting_script_approval') {
      throw new BadRequestException(`Job is not awaiting script approval (status: ${job.status})`);
    }

    await this.db.updateJob(id, {
      approved_script: script,
      status: 'pending',
    });

    await this.queue.add('run', { jobId: id, phase: 2 }, { attempts: 1 });

    return { ok: true };
  }

  async findOne(userId: string, id: string) {
    return this.db.getJobForUser(id, userId);
  }

  async findAll(userId: string) {
    return this.db.listJobsForUser(userId);
  }
}
