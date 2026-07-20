import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { VideoProvider } from '../interfaces/video.provider.interface';
import { KieKlingProvider } from './kie-kling.provider';
import { KieSora2Provider } from './kie-sora2.provider';
import { KieVeo3Provider } from './kie-veo3.provider';

@Injectable()
export class VideoProviderRegistry implements OnModuleInit {
  private readonly logger = new Logger(VideoProviderRegistry.name);
  private readonly map = new Map<string, VideoProvider>();

  constructor(private config: ConfigService) {}

  onModuleInit() {
    if (!this.config.get<string>('KIE_API_KEY')) {
      this.logger.warn('KIE_API_KEY tanımlı değil — video üretimi çalışmayacak, .env dosyasına ekleyin');
      return;
    }

    const kieStandard = new KieKlingProvider(this.config, 'standard');
    this.map.set('kling_standard', kieStandard);
    this.map.set('kling_nano',     kieStandard); // Kling 1.6 kie market'te yok — standard'a eşlenir
    this.map.set('fal_kling',      kieStandard); // eski fal.ai anahtarıyla kayıtlı işler
    this.map.set('kling_pro',      new KieKlingProvider(this.config, 'pro'));
    this.map.set('sora2',          new KieSora2Provider(this.config));
    this.map.set('veo3',           new KieVeo3Provider(this.config));
  }

  getProvider(key?: string | null): VideoProvider {
    const provider = this.map.get(key ?? 'kling_standard') ?? this.map.get('kling_standard');
    if (!provider) {
      throw new Error('Video provider yok: KIE_API_KEY .env dosyasında tanımlı olmalı');
    }
    return provider;
  }
}
