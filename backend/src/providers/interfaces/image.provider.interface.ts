export interface ImageGenerateParams {
  prompt: string;
  aspectRatio: string;
  /**
   * Referans görseller (maks 8-10): doluysa üretim image-edit modeliyle yapılır
   * ve bu görsellerdeki kişi/nesne/mekân yeni görselde birebir korunur.
   * Story karakter tutarlılığı + etiketli referans kütüphanesi bunu kullanır.
   */
  referenceImageUrls?: string[];
}

export interface ImageProvider {
  generateImage(params: ImageGenerateParams): Promise<Buffer>;
}
