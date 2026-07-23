import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { JobsController } from './jobs.controller';
import { JobsService, VIDEO_PIPELINE_QUEUE } from './jobs.service';
import { JobsProcessor } from './jobs.processor';
import { DatabaseModule } from '../database/database.module';
import { StorageModule } from '../storage/storage.module';
import { PipelineModule } from '../pipeline/pipeline.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: VIDEO_PIPELINE_QUEUE }),
    DatabaseModule,
    StorageModule,
    PipelineModule,
    AuthModule,
  ],
  controllers: [JobsController],
  providers: [JobsService, JobsProcessor],
})
export class JobsModule {}
