import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TtsProvider, TtsParams } from '../interfaces/tts.provider.interface';

// ElevenLabs doğrudan API (fal.ai proxy'si kaldırıldı)
// POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id} → mp3 bytes
// eleven_multilingual_v2 dili metinden kendisi algılar (language_code almaz).
const VOICE_MAP: Record<'female' | 'male', string> = {
  female: 'EXAVITQu4vr4xnSDxMaL', // Sarah
  male: 'pNInz6obpgDQGcFmaJgB',   // Adam
};

@Injectable()
export class ElevenLabsDirectProvider implements TtsProvider {
  constructor(private config: ConfigService) {}

  async synthesize(params: TtsParams): Promise<Buffer> {
    // Lazy okuma: anahtar eksikse boot'ta değil, ilk kullanımda anlaşılır hata
    const apiKey = this.config.get<string>('ELEVENLABS_API_KEY');
    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY .env dosyasında tanımlı olmalı (TTS için gerekli)');
    }
    const voiceId = VOICE_MAP[params.gender];

    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: params.text,
          model_id: 'eleven_multilingual_v2',
          // Düşük stability + yüksek style = canlı, vurgulu UGC okuyuşu
          voice_settings: {
            stability: 0.3,
            similarity_boost: 0.75,
            style: 0.7,
            use_speaker_boost: true,
          },
        }),
      },
    );

    if (!res.ok) {
      throw new Error(`ElevenLabs TTS failed (${res.status}): ${await res.text()}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
}
