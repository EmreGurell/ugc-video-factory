import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// kie.ai Suno API — enstrümantal arka plan müziği üretimi
//   Create: POST /api/v1/generate  { customMode:true, instrumental:true, style, title, model }
//   Poll:   GET  /api/v1/generate/record-info?taskId=
//           status: PENDING | TEXT_SUCCESS | FIRST_SUCCESS | SUCCESS | *_FAILED | SENSITIVE_WORD_ERROR
//           ses: data.response.sunoData[0].audioUrl
// Docs: https://docs.kie.ai/suno-api/generate-music
// Üretim 1-3 dk sürer; FIRST_SUCCESS'te ilk parça hazır olabilir ama SUCCESS beklenir.

const SUNO_FAIL_STATUSES = new Set([
  'CREATE_TASK_FAILED',
  'GENERATE_AUDIO_FAILED',
  'CALLBACK_EXCEPTION',
  'SENSITIVE_WORD_ERROR',
]);

@Injectable()
export class KieSunoProvider {
  private readonly logger = new Logger(KieSunoProvider.name);

  constructor(private config: ConfigService) {}

  async generateInstrumental(style: string, title: string): Promise<Buffer> {
    const apiKey = this.config.get<string>('KIE_API_KEY');
    if (!apiKey) throw new Error('KIE_API_KEY .env dosyasında tanımlı olmalı (AI müzik için gerekli)');

    const res = await fetch('https://api.kie.ai/api/v1/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        prompt: '',
        customMode: true,
        instrumental: true,
        style: style.slice(0, 1000),
        title: title.slice(0, 80),
        model: 'V4_5',
      }),
    });
    if (!res.ok) throw new Error(`kie.ai Suno submit failed: ${await res.text()}`);

    const body = (await res.json()) as { code: number; msg: string; data?: { taskId: string } };
    if (body.code !== 200 || !body.data?.taskId) {
      throw new Error(`kie.ai Suno createTask failed: ${body.msg ?? JSON.stringify(body)}`);
    }
    this.logger.log(`kie.ai Suno task: ${body.data.taskId}`);

    const audioUrl = await this.pollForResult(apiKey, body.data.taskId);
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) throw new Error(`Suno audio download failed: ${audioRes.statusText}`);
    return Buffer.from(await audioRes.arrayBuffer());
  }

  private async pollForResult(apiKey: string, taskId: string): Promise<string> {
    const maxAttempts = 45; // 10s aralıkla ~7.5 dk
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 10_000));

      const res = await fetch(
        `https://api.kie.ai/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      if (!res.ok) continue;

      const body = (await res.json()) as {
        data?: {
          status: string;
          errorMessage?: string;
          response?: { sunoData?: Array<{ audioUrl?: string; duration?: number }> };
        };
      };

      const status = body.data?.status;
      if (status === 'SUCCESS') {
        const url = body.data?.response?.sunoData?.[0]?.audioUrl;
        if (!url) throw new Error(`Suno task ${taskId}: SUCCESS ama audioUrl boş`);
        return url;
      }
      if (status && SUNO_FAIL_STATUSES.has(status)) {
        throw new Error(`Suno task ${taskId} failed (${status}): ${body.data?.errorMessage ?? ''}`);
      }
      // PENDING | TEXT_SUCCESS | FIRST_SUCCESS → beklemeye devam
    }
    throw new Error(`Suno task ${taskId} timed out (~7.5 dk)`);
  }
}
