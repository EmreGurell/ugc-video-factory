import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PipelineService } from '../pipeline/pipeline.service';
import { VIDEO_PIPELINE_QUEUE } from './jobs.service';

@Processor(VIDEO_PIPELINE_QUEUE, { concurrency: 2 })
export class JobsProcessor extends WorkerHost {
  constructor(private pipeline: PipelineService) {
    super();
  }

  async process(job: Job<{ jobId: string; phase?: number }>): Promise<void> {
    const { jobId, phase = 1 } = job.data;
    if (phase === 2) {
      await this.pipeline.runPhase2(jobId);
    } else {
      await this.pipeline.runPhase1(jobId);
    }
  }
}
