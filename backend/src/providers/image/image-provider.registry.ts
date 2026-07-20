import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ImageProvider } from '../interfaces/image.provider.interface';
import { KieImageProvider } from './kie-image.provider';

@Injectable()
export class ImageProviderRegistry implements OnModuleInit {
  private readonly logger = new Logger(ImageProviderRegistry.name);
  private readonly map = new Map<string, ImageProvider>();

  constructor(private config: ConfigService) {}

  onModuleInit() {
    if (!this.config.get<string>('KIE_API_KEY')) {
      this.logger.warn('KIE_API_KEY tanımlı değil — görsel üretimi çalışmayacak, .env dosyasına ekleyin');
      return;
    }

    const standard = new KieImageProvider(this.config, 'standard');
    const pro = new KieImageProvider(this.config, 'pro');

    this.map.set('nano_banana',     standard);
    this.map.set('nano_banana_pro', pro);

    // Geriye dönük uyumluluk: eski fal.ai anahtarlarıyla kayıtlı işler
    for (const legacy of ['flux_schnell', 'flux_dev', 'imagen_fast']) {
      this.map.set(legacy, standard);
    }
    for (const legacy of ['flux_pro', 'imagen']) {
      this.map.set(legacy, pro);
    }
  }

  getProvider(key?: string | null): ImageProvider {
    const provider = this.map.get(key ?? 'nano_banana') ?? this.map.get('nano_banana');
    if (!provider) {
      throw new Error('Görsel provider yok: KIE_API_KEY .env dosyasında tanımlı olmalı');
    }
    return provider;
  }
}
