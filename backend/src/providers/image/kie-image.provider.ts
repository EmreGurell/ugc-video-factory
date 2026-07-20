import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageProvider, ImageGenerateParams } from '../interfaces/image.provider.interface';
import { kieCreateTask, kiePollTask } from '../kie/kie-jobs.client';

// kie.ai Market — Google Nano Banana ailesi
// Docs: https://docs.kie.ai/market/google/nano-banana (+ nano-banana-edit, pro-image-to-image)
//   standard t2i : model 'google/nano-banana'        input { prompt, aspect_ratio, output_format }
//   standard edit: model 'google/nano-banana-edit'   input { prompt, image_urls[≤10], aspect_ratio, output_format }
//   pro (t2i+i2i): model 'nano-banana-pro'           input { prompt, image_input[≤8], aspect_ratio, resolution, output_format }
// aspect_ratio bizim değerlerle birebir: '9:16' | '16:9' | '1:1'

@Injectable()
export class KieImageProvider implements ImageProvider {
  private readonly logger = new Logger(KieImageProvider.name);
  private readonly apiKey: string;

  constructor(
    private config: ConfigService,
    private variant: 'standard' | 'pro' = 'standard',
  ) {
    this.apiKey = config.getOrThrow('KIE_API_KEY');
  }

  async generateImage(params: ImageGenerateParams): Promise<Buffer> {
    const refs = params.referenceImageUrls?.filter(Boolean) ?? [];

    let model: string;
    let input: Record<string, unknown>;

    if (this.variant === 'pro') {
      model = 'nano-banana-pro';
      input = {
        prompt: params.prompt.slice(0, 10_000),
        image_input: refs.slice(0, 8),
        aspect_ratio: params.aspectRatio,
        resolution: '1K',
        output_format: 'png',
      };
    } else if (refs.length > 0) {
      model = 'google/nano-banana-edit';
      input = {
        prompt: params.prompt.slice(0, 5000),
        image_urls: refs.slice(0, 10),
        aspect_ratio: params.aspectRatio,
        output_format: 'png',
      };
    } else {
      model = 'google/nano-banana';
      input = {
        prompt: params.prompt.slice(0, 5000),
        aspect_ratio: params.aspectRatio,
        output_format: 'png',
      };
    }

    const taskId = await kieCreateTask(this.apiKey, model, input);
    this.logger.log(`kie.ai image task (${model}${refs.length ? `, ${refs.length} ref` : ''}): ${taskId}`);

    const imageUrl = await kiePollTask(this.apiKey, taskId, { intervalMs: 3000, maxAttempts: 100 });
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`kie.ai image download failed: ${res.statusText}`);
    return Buffer.from(await res.arrayBuffer());
  }
}
