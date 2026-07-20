import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VideoProvider, VideoClipParams } from '../interfaces/video.provider.interface';

// kie.ai Veo 3 — ayrı API ailesi (Market/jobs değil):
//   Create: POST /api/v1/veo/generate            → data.taskId
//   Poll:   GET  /api/v1/veo/record-info?taskId= → data.successFlag (0 üretiliyor,
//           1 başarılı, 2/3 başarısız), sonuç: data.response.resultUrls[0]
// Docs: https://docs.kie.ai/veo3-api/generate-veo-3-video
//
// hasNativeAudio=true → ses videonun içinde (narration prompt'a gömülür),
// pipeline TTS ve mixAudioVideo'yu atlar. Süre: Veo maks 8s üretir; duration
// gönderilmez, varsayılan kullanılır.

@Injectable()
export class KieVeo3Provider implements VideoProvider {
  readonly hasNativeAudio = true;
  private readonly logger = new Logger(KieVeo3Provider.name);
  private readonly apiKey: string;

  constructor(private config: ConfigService) {
    this.apiKey = config.getOrThrow('KIE_API_KEY');
  }

  async generateVideoClip(params: VideoClipParams): Promise<Buffer> {
    const submitRes = await fetch('https://api.kie.ai/api/v1/veo/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        prompt: params.motionPrompt,
        imageUrls: [params.imageUrl],
        model: 'veo3_fast',
        aspect_ratio: params.aspectRatio ?? '9:16',
        enableTranslation: false,
      }),
    });

    if (!submitRes.ok) {
      throw new Error(`kie.ai Veo3 submit failed: ${await submitRes.text()}`);
    }

    const body = (await submitRes.json()) as {
      code: number;
      msg: string;
      data?: { taskId: string };
    };
    if (body.code !== 200 || !body.data?.taskId) {
      throw new Error(`kie.ai Veo3 createTask failed: ${body.msg ?? JSON.stringify(body)}`);
    }
    this.logger.log(`kie.ai Veo3 task: ${body.data.taskId}`);

    const videoUrl = await this.pollForResult(body.data.taskId);
    const res = await fetch(videoUrl);
    if (!res.ok) throw new Error(`kie.ai Veo3 video download failed: ${res.statusText}`);
    return Buffer.from(await res.arrayBuffer());
  }

  private async pollForResult(taskId: string): Promise<string> {
    const maxAttempts = 120; // ~10 dk
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 5000));

      const res = await fetch(
        `https://api.kie.ai/api/v1/veo/record-info?taskId=${encodeURIComponent(taskId)}`,
        { headers: { Authorization: `Bearer ${this.apiKey}` } },
      );
      if (!res.ok) continue; // geçici hata — polling'i öldürme

      const body = (await res.json()) as {
        data?: {
          successFlag: number;
          response?: { resultUrls?: string[] };
          errorMessage?: string;
          errorCode?: number;
        };
      };

      const flag = body.data?.successFlag;
      if (flag === 1) {
        const url = body.data?.response?.resultUrls?.[0];
        if (!url) throw new Error(`kie.ai Veo3 ${taskId}: başarılı ama resultUrls boş`);
        return url;
      }
      if (flag === 2 || flag === 3) {
        throw new Error(
          `kie.ai Veo3 failed (${body.data?.errorCode ?? flag}): ${body.data?.errorMessage ?? 'unknown'}`,
        );
      }
      // 0 → üretiliyor, beklemeye devam
    }
    throw new Error('kie.ai Veo3 task timed out (10 dk)');
  }
}
