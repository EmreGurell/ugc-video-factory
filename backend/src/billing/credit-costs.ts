import { CreateJobDto, VIDEO_TYPES, STATIC_TYPES } from '../jobs/dto/create-job.dto';

// Kredi = sabit bir USD birimi (marj payı dahil, gerçek sağlayıcı maliyetinden yüksek).
// Organization.credits_remaining ve Plan.monthly_credit_allowance hep bu birimde.
export const USD_PER_CREDIT = 0.05;

// kie.ai gerçek sağlayıcı maliyetleri (CLAUDE.md fiyat tablosu) — ProviderCostEvent'e
// yazılan gerçek USD değerleri, kredi tahminiyle karıştırılmamalı.
export const IMAGE_MODEL_COST_USD: Record<string, number> = {
  nano_banana: 0.025,
  nano_banana_pro: 0.06,
  flux_schnell: 0.025,
  flux_dev: 0.025,
  flux_pro: 0.06,
  imagen_fast: 0.025,
  imagen: 0.06,
};

export const VIDEO_MODEL_CLIP_COST_USD: Record<string, number> = {
  kling_standard: 0.125,
  kling_nano: 0.125,
  fal_kling: 0.125,
  kling_pro: 0.35,
  sora2: 0.5,
  veo3: 0.4,
};

export const TTS_COST_USD = 0.03;
export const MUSIC_COST_USD: Record<'library' | 'ai', number> = { library: 0, ai: 0.1 };

// veo3 native sesle geliyor — ayrı TTS çağrısı yapılmaz.
export const NATIVE_AUDIO_VIDEO_MODELS = new Set(['veo3']);

function usdToCredits(usd: number): number {
  return Math.ceil(usd / USD_PER_CREDIT);
}

// Job oluşturma anında tahmini kredi maliyeti — gerçek sağlayıcı çağrılarından
// ÖNCE hesaplanır, org bakiyesinden düşülür. Gerçek maliyet ProviderCostEvent'te
// ayrıca birikir (ödeme/kota kararını etkilemez, sadece marj analitiği içindir).
export function estimateJobCredits(dto: Pick<CreateJobDto, 'content_type' | 'video_model' | 'image_model' | 'scene_count' | 'music_mode'>): number {
  const contentType = dto.content_type ?? 'ugc_selfie';
  const imageModel = dto.image_model ?? 'nano_banana';
  const videoModel = dto.video_model ?? 'kling_standard';
  const sceneCount = dto.scene_count ?? 3;
  const imageCostUsd = IMAGE_MODEL_COST_USD[imageModel] ?? IMAGE_MODEL_COST_USD.nano_banana;

  if (STATIC_TYPES.includes(contentType)) {
    if (contentType === 'before_after') return usdToCredits(imageCostUsd * 2);
    return usdToCredits(imageCostUsd);
  }

  if (!VIDEO_TYPES.includes(contentType)) return usdToCredits(imageCostUsd);

  const clipCostUsd = VIDEO_MODEL_CLIP_COST_USD[videoModel] ?? VIDEO_MODEL_CLIP_COST_USD.kling_standard;
  const hasNativeAudio = NATIVE_AUDIO_VIDEO_MODELS.has(videoModel);
  const ttsCostUsd = hasNativeAudio ? 0 : TTS_COST_USD;

  // story: sahne başına ayrı görsel + klip; diğer video tipleri: tek görsel + sahne başına klip.
  const imagesNeeded = contentType === 'story' ? sceneCount : 1;
  const musicCostUsd = dto.music_mode && dto.music_mode !== 'none' ? MUSIC_COST_USD[dto.music_mode] : 0;

  const totalUsd = imageCostUsd * imagesNeeded + (clipCostUsd + ttsCostUsd) * sceneCount + musicCostUsd;
  return usdToCredits(totalUsd);
}
