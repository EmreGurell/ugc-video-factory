import { IsString, IsNotEmpty, IsOptional, IsIn, IsUrl, IsInt, Min, Max, IsArray, ArrayMaxSize } from 'class-validator';

export const CONTENT_TYPES = [
  'ugc_selfie',
  'ugc_walking',
  'ugc_car',
  'unboxing',
  'testimonial',
  'grwm',
  'story',
  'lifestyle',
  'product_demo',
  'meme',
  'product_shot',
  'before_after',
  'text_animation',
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

export const VIDEO_TYPES: ContentType[] = [
  'ugc_selfie',
  'ugc_walking',
  'ugc_car',
  'unboxing',
  'testimonial',
  'grwm',
  'story',
  'lifestyle',
  'product_demo',
  'text_animation',
];

export const STATIC_TYPES: ContentType[] = [
  'meme',
  'product_shot',
  'before_after',
];

export const VOICE_LANGUAGES = ['tr', 'kk', 'en', 'ru'] as const;
export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number];

export class CreateJobDto {
  @IsString()
  @IsNotEmpty()
  product_name: string;

  @IsOptional()
  @IsString()
  character_description?: string;

  @IsOptional()
  @IsString()
  script?: string;

  @IsOptional()
  @IsIn(['9:16', '16:9', '1:1'])
  aspect_ratio?: string;

  @IsOptional()
  @IsIn(CONTENT_TYPES)
  content_type?: ContentType;

  @IsOptional()
  @IsIn(VOICE_LANGUAGES)
  voice_language?: VoiceLanguage;

  @IsOptional()
  @IsIn(['female', 'male'])
  voice_gender?: 'female' | 'male';

  @IsOptional()
  @IsString()
  video_brief?: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(5)
  scene_count?: number;

  @IsOptional()
  @IsIn(['calm', 'dynamic'])
  video_style?: 'calm' | 'dynamic';

  @IsOptional()
  @IsUrl()
  reference_image_url?: string;

  /** Referans kütüphanesinden elle seçilen etiketler; boşsa Claude otomatik eşleştirir */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  reference_tags?: string[];

  @IsOptional()
  @IsIn(['none', 'library', 'ai'])
  music_mode?: 'none' | 'library' | 'ai';

  @IsOptional()
  @IsString()
  music_style?: string;

  @IsOptional()
  @IsIn(['nano_banana', 'nano_banana_pro', 'flux_schnell', 'flux_dev', 'flux_pro', 'imagen_fast', 'imagen'])
  image_model?: string;

  @IsOptional()
  @IsIn(['kling_standard', 'kling_nano', 'kling_pro', 'sora2', 'veo3'])
  video_model?: string;
}
