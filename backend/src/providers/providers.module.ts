import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { IMAGE_PROVIDER, VIDEO_PROVIDER, TTS_PROVIDER } from './providers.tokens';
import type { ImageProvider } from './interfaces/image.provider.interface';
import type { VideoProvider } from './interfaces/video.provider.interface';
import { ElevenLabsDirectProvider } from './tts/elevenlabs-direct.provider';
import { KieElevenLabsProvider } from './tts/kie-elevenlabs.provider';
import { FfmpegService } from './ffmpeg/ffmpeg.service';
import { ImageProviderRegistry } from './image/image-provider.registry';
import { VideoProviderRegistry } from './video/video-provider.registry';
import { KieSunoProvider } from './music/kie-suno.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    FfmpegService,
    ImageProviderRegistry,
    VideoProviderRegistry,
    KieSunoProvider,

    // Legacy single-provider tokens (pipeline registry'leri kullanır; bunlar
    // registry dışı kalan tekil bağımlılıklar için)
    {
      provide: IMAGE_PROVIDER,
      useFactory: (registry: ImageProviderRegistry): ImageProvider => ({
        generateImage: (params) => registry.getProvider().generateImage(params),
      }),
      inject: [ImageProviderRegistry],
    },
    {
      provide: VIDEO_PROVIDER,
      useFactory: (registry: VideoProviderRegistry): VideoProvider => ({
        get hasNativeAudio() {
          return registry.getProvider().hasNativeAudio;
        },
        generateVideoClip: (params) => registry.getProvider().generateVideoClip(params),
      }),
      inject: [VideoProviderRegistry],
    },
    {
      // ELEVENLABS_API_KEY tanımlıysa doğrudan ElevenLabs, yoksa kie.ai proxy'si —
      // tek KIE_API_KEY ile tüm sistem çalışır
      provide: TTS_PROVIDER,
      useFactory: (config: ConfigService) =>
        config.get<string>('ELEVENLABS_API_KEY')
          ? new ElevenLabsDirectProvider(config)
          : new KieElevenLabsProvider(config),
      inject: [ConfigService],
    },
  ],
  exports: [
    IMAGE_PROVIDER,
    VIDEO_PROVIDER,
    TTS_PROVIDER,
    FfmpegService,
    ImageProviderRegistry,
    VideoProviderRegistry,
    KieSunoProvider,
  ],
})
export class ProvidersModule {}
