import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TtsProvider, TtsParams } from '../interfaces/tts.provider.interface';
import { kieCreateTask, kiePollTask } from '../kie/kie-jobs.client';

// kie.ai Market — ElevenLabs Multilingual v2 (ayrı ElevenLabs hesabı gerektirmez)
// Docs: https://docs.kie.ai/market/elevenlabs/text-to-speech-multilingual-v2
// model: 'elevenlabs/text-to-speech-multilingual-v2'
// input: { text, voice, stability, similarity_boost, style, speed }
// DİKKAT: kie yalnızca kendi 67 hazır ses ID'sini kabul eder — resmi ElevenLabs
// ID'leri (Sarah/Adam) "not within the range of allowed options" hatası verir.
const VOICE_MAP: Record<'female' | 'male', string> = {
  female: 'lcMyyd2HUfFzxdCaC4Ta', // Lucy — "Fresh & Casual" (UGC tonu)
  male: '1SM7GgM6IMuvQlz2BwM3',   // Mark — "Casual, Relaxed and Light"
};

@Injectable()
export class KieElevenLabsProvider implements TtsProvider {
  private readonly logger = new Logger(KieElevenLabsProvider.name);

  constructor(private config: ConfigService) {}

  async synthesize(params: TtsParams): Promise<Buffer> {
    const apiKey = this.config.get<string>('KIE_API_KEY');
    if (!apiKey) throw new Error('KIE_API_KEY .env dosyasında tanımlı olmalı (TTS için gerekli)');

    const taskId = await kieCreateTask(apiKey, 'elevenlabs/text-to-speech-multilingual-v2', {
      text: params.text,
      voice: VOICE_MAP[params.gender],
      // Düşük stability + yüksek style = canlı, vurgulu UGC okuyuşu
      stability: 0.3,
      similarity_boost: 0.75,
      style: 0.7,
      speed: 1,
    });
    this.logger.log(`kie.ai TTS task: ${taskId}`);

    const audioUrl = await kiePollTask(apiKey, taskId, { intervalMs: 3000, maxAttempts: 100 });
    const res = await fetch(audioUrl);
    if (!res.ok) throw new Error(`kie.ai TTS download failed: ${res.statusText}`);
    return Buffer.from(await res.arrayBuffer());
  }
}
