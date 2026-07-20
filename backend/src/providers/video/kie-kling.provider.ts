import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VideoProvider, VideoClipParams } from '../interfaces/video.provider.interface';
import { kieCreateTask, kiePollTask } from '../kie/kie-jobs.client';

// kie.ai Market — Kling 2.1 image-to-video
// Docs: https://docs.kie.ai/market/kling/v2-1-standard
// Not: Kling 1.6 kie.ai market'te yok; 'nano' tier registry'de standard'a eşlenir.
const KIE_KLING_MODELS: Record<string, string> = {
  standard: 'kling/v2-1-standard',
  pro:      'kling/v2-1-pro',
};

@Injectable()
export class KieKlingProvider implements VideoProvider {
  readonly hasNativeAudio = false;
  private readonly logger = new Logger(KieKlingProvider.name);
  private readonly apiKey: string;

  constructor(
    private config: ConfigService,
    private tier: 'standard' | 'pro' = 'standard',
  ) {
    this.apiKey = config.getOrThrow('KIE_API_KEY');
  }

  async generateVideoClip(params: VideoClipParams): Promise<Buffer> {
    const model = KIE_KLING_MODELS[this.tier] ?? KIE_KLING_MODELS.standard;

    const taskId = await kieCreateTask(this.apiKey, model, {
      prompt: params.motionPrompt.slice(0, 5000),
      image_url: params.imageUrl,
      duration: params.duration >= 10 ? '10' : '5',
      negative_prompt: 'blur, distortion, low quality, morphing face, warped hands',
      cfg_scale: 0.5,
    });
    this.logger.log(`kie.ai Kling ${this.tier} task: ${taskId}`);

    const videoUrl = await kiePollTask(this.apiKey, taskId);
    const res = await fetch(videoUrl);
    if (!res.ok) throw new Error(`kie.ai Kling video download failed: ${res.statusText}`);
    return Buffer.from(await res.arrayBuffer());
  }
}
