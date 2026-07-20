export interface VideoClipParams {
  imageUrl: string;
  motionPrompt: string;
  duration: number;
  /** '9:16' | '16:9' | '1:1' — bazı sağlayıcılar (Veo 3, Sora 2) ister */
  aspectRatio?: string;
}

export interface VideoProvider {
  /** true = video already contains audio (e.g. Veo 3), skip TTS step */
  readonly hasNativeAudio: boolean;
  generateVideoClip(params: VideoClipParams): Promise<Buffer>;
}
