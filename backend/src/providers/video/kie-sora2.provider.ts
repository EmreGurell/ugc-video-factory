import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VideoProvider, VideoClipParams } from '../interfaces/video.provider.interface';
import { kieCreateTask, kiePollTask } from '../kie/kie-jobs.client';

// kie.ai Market — Sora 2 image-to-video
// Docs: https://docs.kie.ai/market/sora2/sora-2-image-to-video
// Sora 2 kendi ortam sesini üretir ama senaryo seslendirmesi garantili olmadığı
// için hasNativeAudio=false: pipeline TTS ile dublaj yapar (Sora sesi atılır).
@Injectable()
export class KieSora2Provider implements VideoProvider {
  readonly hasNativeAudio = false;
  private readonly logger = new Logger(KieSora2Provider.name);
  private readonly apiKey: string;

  constructor(private config: ConfigService) {
    this.apiKey = config.getOrThrow('KIE_API_KEY');
  }

  async generateVideoClip(params: VideoClipParams): Promise<Buffer> {
    let taskId: string;
    try {
      taskId = await kieCreateTask(this.apiKey, 'sora-2-image-to-video', {
        prompt: params.motionPrompt,
        image_urls: [params.imageUrl],
        aspect_ratio: params.aspectRatio === '16:9' ? 'landscape' : 'portrait',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('temporarily paused')) {
        throw new Error(
          'Sora 2 kie.ai tarafında geçici olarak durduruldu — lütfen Kling Standart/Pro veya Veo 3 ile yeni bir iş oluşturun',
        );
      }
      throw err;
    }
    this.logger.log(`kie.ai Sora2 task: ${taskId}`);

    const videoUrl = await kiePollTask(this.apiKey, taskId);
    const res = await fetch(videoUrl);
    if (!res.ok) throw new Error(`kie.ai Sora2 video download failed: ${res.statusText}`);
    return Buffer.from(await res.arrayBuffer());
  }
}
