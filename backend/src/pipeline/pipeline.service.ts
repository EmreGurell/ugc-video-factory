import { Injectable, Logger, Inject } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseService, Job, Scene, ReferencePhoto } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { ClaudeService, UGC_REALISM_RULES, LANGUAGE_NAMES } from './claude.service';
import { VIDEO_TYPES, STATIC_TYPES, ContentType } from '../jobs/dto/create-job.dto';
import { IMAGE_PROVIDER, VIDEO_PROVIDER, TTS_PROVIDER } from '../providers/providers.tokens';
import type { ImageProvider } from '../providers/interfaces/image.provider.interface';
import type { VideoProvider } from '../providers/interfaces/video.provider.interface';
import type { TtsProvider } from '../providers/interfaces/tts.provider.interface';
import { FfmpegService } from '../providers/ffmpeg/ffmpeg.service';
import { OverlayService } from './overlay.service';
import { ImageProviderRegistry } from '../providers/image/image-provider.registry';
import { VideoProviderRegistry } from '../providers/video/video-provider.registry';
import { KieSunoProvider } from '../providers/music/kie-suno.provider';
import { NotificationsService } from '../notifications/notifications.service';

const MUSIC_LIBRARY_DIR = path.join(process.cwd(), 'assets', 'music');

// Kamera karşısında konuşan tipler: Kling'e ağız hareketi açıkça söylenmezse
// karakter donuk kalıyor. Voiceover tipleri (lifestyle, product_demo,
// text_animation) hariç tutulur — onlarda kişi konuşuyor görünmemeli.
// story da hariç: süreç/POV sahneleri olabilir, konuşma kararını sahne bazında
// planStory'nin motion_prompt'u verir.
const TALKING_TYPES: ContentType[] = [
  'ugc_selfie', 'ugc_walking', 'ugc_car', 'unboxing', 'testimonial', 'grwm',
];

const TALKING_CUE =
  'IMPORTANT: the person is actively talking on camera for the entire clip — lips and jaw continuously moving in natural speech, small head movements, expressive eyebrows and eyes, occasional hand gestures while speaking';

// Referans etiketleri artık "klasör": bir tag birden fazla foto/video karesi
// tutabilir. Görsel üretimine bu limitlerle gönderilir (nano-banana-edit maks 10 alır).
const MAX_REFS_PER_TAG = 3;
const MAX_TOTAL_REF_IMAGES = 8;

interface ResolvedReference {
  tag: string;
  description?: string;
  urls: string[];
}

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    private db: DatabaseService,
    private storage: StorageService,
    private claude: ClaudeService,
    private overlay: OverlayService,
    private ffmpeg: FfmpegService,
    private imageRegistry: ImageProviderRegistry,
    private videoRegistry: VideoProviderRegistry,
    private suno: KieSunoProvider,
    private notifications: NotificationsService,
    @Inject(IMAGE_PROVIDER) private imageProvider: ImageProvider,
    @Inject(VIDEO_PROVIDER) private videoProvider: VideoProvider,
    @Inject(TTS_PROVIDER) private ttsProvider: TtsProvider,
  ) {}

  // ─── PHASE 1: Research + Script ──────────────────────────────────────────

  async runPhase1(jobId: string): Promise<void> {
    try {
      const job = await this.db.getJob(jobId);
      this.logger.log(`[${jobId}] Phase 1: ${job.content_type}`);

      // Static types skip Phase 1 entirely — queue Phase 2 directly
      if (STATIC_TYPES.includes(job.content_type)) {
        await this.db.updateJob(jobId, {
          approved_script: job.prompt_script ?? '',
          status: 'pending',
        });
        // Phase 2 will be queued by the processor — re-run via runPhase2
        await this.runPhase2(jobId);
        return;
      }

      await this.db.updateStatus(jobId, 'researching_product');
      const research = await this.claude.researchProduct(
        job.product_name ?? job.prompt_character ?? 'Product',
        job.reference_image_url,
      );
      await this.db.updateJob(jobId, { product_research: research });
      this.logger.log(`[${jobId}] Research done`);

      await this.db.updateStatus(jobId, 'writing_script');
      // Elle seçilmiş referans etiketleri varsa senaryoya baştan besleniyor —
      // yoksa senaryo mekân/nesne ayrımı içermiyor ve Faz 2'deki sahne
      // planlaması hangi sahnenin hangi referansa denk geldiğini çıkaramıyor.
      const scriptReferences = job.reference_tags?.length
        ? this.groupByTag(await this.db.getReferencePhotosByTags(job.reference_tags, job.organization_id))
        : [];
      const draftScript = await this.claude.writeScript(
        job.product_name ?? job.prompt_character ?? 'Product',
        research,
        job.content_type,
        job.video_brief,
        job.voice_language,
        job.scene_count ?? 3,
        scriptReferences.map((r) => ({ tag: r.tag, description: r.description })),
      );
      await this.db.updateJob(jobId, { draft_script: draftScript });
      this.logger.log(`[${jobId}] Draft script written`);

      await this.db.updateStatus(jobId, 'awaiting_script_approval');
      this.logger.log(`[${jobId}] Waiting for script approval`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[${jobId}] Phase 1 failed: ${message}`);
      await this.db.updateJob(jobId, { status: 'failed', error_message: message });
      await this.notifyJobResult(jobId, false);
    }
  }

  // ─── PHASE 2: Image + Video ───────────────────────────────────────────────

  async runPhase2(jobId: string): Promise<void> {
    try {
      const job = await this.db.getJob(jobId);
      this.logger.log(`[${jobId}] Phase 2: ${job.content_type}`);

      if (job.content_type === 'story') {
        await this.runStoryPipeline(jobId, job);
      } else if (VIDEO_TYPES.includes(job.content_type)) {
        await this.runVideoPipeline(jobId, job);
      } else if (job.content_type === 'meme') {
        await this.runMemePipeline(jobId, job);
      } else if (job.content_type === 'product_shot') {
        await this.runProductShotPipeline(jobId, job);
      } else if (job.content_type === 'before_after') {
        await this.runBeforeAfterPipeline(jobId, job);
      }
      await this.notifyJobResult(jobId, true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[${jobId}] Phase 2 failed: ${message}`);
      await this.db.updateJob(jobId, { status: 'failed', error_message: message });
      await this.notifyJobResult(jobId, false);
    }
  }

  // Push bildirimi best-effort'tur: gönderim hatası pipeline sonucunu etkilemez.
  private async notifyJobResult(jobId: string, success: boolean): Promise<void> {
    try {
      const job = await this.db.getJob(jobId);
      await this.notifications.sendToUser(job.user_id, {
        title: success ? 'Video hazır 🎬' : 'Üretim başarısız',
        body: success
          ? `"${job.product_name ?? 'Videon'}" tamamlandı, hemen izle.`
          : 'Video üretiminde bir sorun oluştu, işe göz at.',
        data: { job_id: jobId },
      });
    } catch (err) {
      this.logger.warn(`[${jobId}] Push bildirimi gönderilemedi: ${err instanceof Error ? err.message : err}`);
    }
  }

  // ─── VIDEO PIPELINE ───────────────────────────────────────────────────────

  private async runVideoPipeline(jobId: string, job: Job): Promise<void> {
    const videoProvider = this.videoRegistry.getProvider(job.video_model);
    const script = job.approved_script ?? job.prompt_script ?? '';

    // Etiketli referans fotoğrafları (elle seçilmiş veya Claude eşleştirmesi)
    const references = await this.resolveReferences(job, script);
    if (references.length) {
      this.logger.log(`[${jobId}] References: ${references.map((r) => r.tag).join(', ')}`);
    }

    await this.db.updateStatus(jobId, 'generating_image');
    const imageBuffer = await this.generateProductImage(job, references);
    const imageUrl = await this.storage.uploadToStorage(imageBuffer, `${jobId}/image.jpg`, 'image/jpeg');
    await this.db.updateJob(jobId, { image_url: imageUrl });
    this.logger.log(`[${jobId}] Image ready: ${imageUrl} (model: ${job.image_model ?? 'nano_banana'})`);

    await this.db.updateStatus(jobId, 'analyzing_image');
    const analysis = await this.claude.analyzeImage(imageUrl);

    await this.db.updateStatus(jobId, 'breaking_scenes');
    const scenes = await this.claude.breakIntoScenes(
      script, analysis, job.content_type,
      job.scene_count ?? 3,
      (job.video_style as 'calm' | 'dynamic') ?? 'dynamic',
    );
    await this.db.updateJob(jobId, { scenes });
    this.logger.log(`[${jobId}] ${scenes.length} scenes (video: ${job.video_model ?? 'kling_standard'})`);

    await this.db.updateStatus(jobId, 'generating_clips');
    const clipUrls: string[] = [];

    for (let i = 0; i < scenes.length; i++) {
      this.logger.log(`[${jobId}] Clip ${i + 1}/${scenes.length}`);
      const clipBuffer = await this.generateClipForScene(videoProvider, job, scenes[i], imageUrl);
      const clipUrl = await this.storage.uploadToStorage(clipBuffer, `${jobId}/clip-${i}.mp4`, 'video/mp4');
      clipUrls.push(clipUrl);
      await this.db.updateJob(jobId, { clip_urls: clipUrls });
    }

    await this.db.updateStatus(jobId, 'stitching');
    let finalBuffer = await this.ffmpeg.stitchClips(clipUrls);
    finalBuffer = await this.applyMusic(jobId, job, finalBuffer, script);
    const finalUrl = await this.storage.uploadToStorage(finalBuffer, `${jobId}/final.mp4`, 'video/mp4');

    await this.db.updateJob(jobId, { status: 'completed', final_video_url: finalUrl });
    this.logger.log(`[${jobId}] Completed: ${finalUrl}`);
  }

  // ─── STORY PIPELINE ───────────────────────────────────────────────────────
  // Her sahne AYRI bir an/mekân: sahne başına ayrı görsel üretilir. Karakter
  // tutarlılığı görsel referansla sağlanır: sahne 2+ görselleri, sahne-0
  // görseli (+ varsa tag fotoğrafı) referans verilerek nano-banana-edit ile üretilir.

  private async runStoryPipeline(jobId: string, job: Job): Promise<void> {
    const videoProvider = this.videoRegistry.getProvider(job.video_model);
    const imageProvider = this.imageRegistry.getProvider(job.image_model);
    const script = job.approved_script ?? job.prompt_script ?? '';

    const references = await this.resolveReferences(job, script);
    if (references.length) {
      this.logger.log(`[${jobId}] References: ${references.map((r) => `${r.tag}(${r.urls.length})`).join(', ')}`);
    }
    const refByTag = new Map(references.map((r) => [r.tag, r]));

    await this.db.updateStatus(jobId, 'breaking_scenes');
    const plan = await this.claude.planStory(
      script,
      job.product_name ?? job.prompt_character ?? 'Product',
      job.scene_count ?? 3,
      (job.video_style as 'calm' | 'dynamic') ?? 'dynamic',
      references.map((r) => ({ tag: r.tag, description: r.description })),
    );
    await this.db.updateJob(jobId, { scenes: plan.scenes });
    this.logger.log(`[${jobId}] Story plan: ${plan.scenes.length} scenes`);

    await this.db.updateStatus(jobId, 'generating_image');
    const scene0Ref = plan.scenes[0].reference_tag
      ? refByTag.get(plan.scenes[0].reference_tag)
      : undefined;
    const firstBuffer = await imageProvider.generateImage({
      prompt: this.composeStoryImagePrompt(plan.scenes[0], plan.character, job, scene0Ref),
      aspectRatio: job.aspect_ratio,
      referenceImageUrls: scene0Ref ? scene0Ref.urls.slice(0, MAX_REFS_PER_TAG) : undefined,
    });
    const firstUrl = await this.storage.uploadToStorage(firstBuffer, `${jobId}/scene-0.jpg`, 'image/jpeg');
    plan.scenes[0].image_url = firstUrl;
    await this.db.updateJob(jobId, { image_url: firstUrl, scenes: plan.scenes });

    // Sadece kişi tarifi alınır (mekânsız) — prompt'taki karakter bloğu için.
    // Asıl tutarlılığı görsel referans (scene-0 image) sağlar.
    await this.db.updateStatus(jobId, 'analyzing_image');
    const personLock = await this.claude.describePerson(firstUrl);

    await this.db.updateStatus(jobId, 'generating_clips');
    const clipUrls: string[] = [];

    for (let i = 0; i < plan.scenes.length; i++) {
      const scene = plan.scenes[i];
      this.logger.log(`[${jobId}] Story clip ${i + 1}/${plan.scenes.length}`);

      let sceneImageUrl = firstUrl;
      if (i > 0) {
        const tagRef = scene.reference_tag ? refByTag.get(scene.reference_tag) : undefined;
        const refUrls = [firstUrl, ...(tagRef ? tagRef.urls.slice(0, 2) : [])];
        // suppressReferencePerson=true: sahne-0 kimliği otorite, tag referansı
        // sadece mekân/nesne için — içindeki olası kişi (ör. dükkan sahibi) yok sayılmalı
        const prompt = `${this.composeStoryImagePrompt(scene, personLock, job, tagRef, true)}
CRITICAL: the FIRST reference image shows this exact person — same face, hair, skin tone and outfit in the new scene. If a second reference image is provided, it is ONLY for the location/object named above — any person visible in it must be completely ignored, do not use their face or body.`;
        const buffer = await imageProvider.generateImage({
          prompt,
          aspectRatio: job.aspect_ratio,
          referenceImageUrls: refUrls,
        });
        sceneImageUrl = await this.storage.uploadToStorage(buffer, `${jobId}/scene-${i}.jpg`, 'image/jpeg');
        scene.image_url = sceneImageUrl;
        await this.db.updateJob(jobId, { scenes: plan.scenes });
      }

      const clipBuffer = await this.generateClipForScene(videoProvider, job, scene, sceneImageUrl);
      const clipUrl = await this.storage.uploadToStorage(clipBuffer, `${jobId}/clip-${i}.mp4`, 'video/mp4');
      clipUrls.push(clipUrl);
      await this.db.updateJob(jobId, { clip_urls: clipUrls });
    }

    await this.db.updateStatus(jobId, 'stitching');
    let finalBuffer = await this.ffmpeg.stitchClips(clipUrls);
    finalBuffer = await this.applyMusic(jobId, job, finalBuffer, script);
    const finalUrl = await this.storage.uploadToStorage(finalBuffer, `${jobId}/final.mp4`, 'video/mp4');

    await this.db.updateJob(jobId, { status: 'completed', final_video_url: finalUrl });
    this.logger.log(`[${jobId}] Completed: ${finalUrl}`);
  }

  private composeStoryImagePrompt(
    scene: Scene,
    character: string,
    job: Job,
    tagRef?: ResolvedReference,
    suppressReferencePerson = false,
  ): string {
    const product = job.product_name
      ? `Product in the story: ${job.product_name} — its color, logo and design must be depicted accurately.`
      : '';
    const refNote = tagRef
      ? `A real reference photo of "${tagRef.tag}" is provided — depict this EXACT subject/location as it appears in the reference (same colors, features, details), integrated naturally into the scene.${
          suppressReferencePerson
            ? ' If a person happens to appear in this reference photo, IGNORE their identity completely — do not depict them; the only person in this scene is described separately below.'
            : ''
        }`
      : '';
    return `PHOTOREALISTIC UGC-style video frame, one candid moment of a bigger personal story.
Scene: ${scene.image_prompt ?? scene.motion_prompt}
The person (identical in every scene of this story): ${character}
${product}
${refNote}
${UGC_REALISM_RULES}`;
  }

  // ─── MEME PIPELINE ────────────────────────────────────────────────────────

  private async runMemePipeline(jobId: string, job: Job): Promise<void> {
    await this.db.updateStatus(jobId, 'generating_image');

    const concept = job.approved_script ?? job.prompt_script ?? job.product_name ?? '';
    const [imageBuffer, caption] = await Promise.all([
      this.getImage(job),
      this.claude.generateMemeCaption(concept),
    ]);

    const imageUrl = await this.storage.uploadToStorage(imageBuffer, `${jobId}/image.jpg`, 'image/jpeg');
    await this.db.updateJob(jobId, { image_url: imageUrl });

    await this.db.updateStatus(jobId, 'compositing');
    const memeBuffer = await this.overlay.addMemeText(imageBuffer, caption.top, caption.bottom);
    const finalUrl = await this.storage.uploadToStorage(memeBuffer, `${jobId}/meme.png`, 'image/png');

    await this.db.updateJob(jobId, { status: 'completed', final_video_url: finalUrl });
  }

  // ─── PRODUCT SHOT PIPELINE ────────────────────────────────────────────────

  private async runProductShotPipeline(jobId: string, job: Job): Promise<void> {
    await this.db.updateStatus(jobId, 'generating_image');
    const imageBuffer = await this.getImage(job);
    const finalUrl = await this.storage.uploadToStorage(imageBuffer, `${jobId}/product.jpg`, 'image/jpeg');
    await this.db.updateJob(jobId, { status: 'completed', image_url: finalUrl, final_video_url: finalUrl });
  }

  // ─── BEFORE/AFTER PIPELINE ────────────────────────────────────────────────

  private async runBeforeAfterPipeline(jobId: string, job: Job): Promise<void> {
    await this.db.updateStatus(jobId, 'generating_images');

    const subject = job.product_name ?? job.prompt_character ?? 'Product';
    const promptJson = await this.claude.craftImagePrompt(subject, job.content_type, job.aspect_ratio);
    let beforePrompt: string;
    let afterPrompt: string;
    try {
      const parsed = JSON.parse(promptJson) as { before: string; after: string };
      beforePrompt = parsed.before;
      afterPrompt = parsed.after;
    } catch {
      throw new Error(`before_after prompt JSON parse failed: ${promptJson}`);
    }

    const [beforeBuffer, afterBuffer] = await Promise.all([
      this.imageProvider.generateImage({ prompt: beforePrompt, aspectRatio: job.aspect_ratio }),
      this.imageProvider.generateImage({ prompt: afterPrompt, aspectRatio: job.aspect_ratio }),
    ]);

    const [beforeUrl] = await Promise.all([
      this.storage.uploadToStorage(beforeBuffer, `${jobId}/before.jpg`, 'image/jpeg'),
      this.storage.uploadToStorage(afterBuffer, `${jobId}/after.jpg`, 'image/jpeg'),
    ]);
    await this.db.updateJob(jobId, { image_url: beforeUrl });

    await this.db.updateStatus(jobId, 'compositing');
    const compositeBuffer = await this.overlay.compositeBeforeAfter(beforeBuffer, afterBuffer, job.aspect_ratio);
    const finalUrl = await this.storage.uploadToStorage(compositeBuffer, `${jobId}/before_after.jpg`, 'image/jpeg');

    await this.db.updateJob(jobId, { status: 'completed', final_video_url: finalUrl });
  }

  // ─── SHARED ───────────────────────────────────────────────────────────────

  // Tek sahnelik klip üretimi: native sesli modellerde narration prompt'a gömülür,
  // diğerlerinde video + TTS paralel üretilip ffmpeg ile mixlenir.
  private async generateClipForScene(
    videoProvider: VideoProvider,
    job: Job,
    scene: Scene,
    imageUrl: string,
  ): Promise<Buffer> {
    const motionPrompt = TALKING_TYPES.includes(job.content_type)
      ? `${scene.motion_prompt}. ${TALKING_CUE}`
      : scene.motion_prompt;

    if (videoProvider.hasNativeAudio) {
      // Veo 3: konuşma dili belirtilir ki narration doğru dilde seslendirilsin
      const language = LANGUAGE_NAMES[job.voice_language] ?? 'Turkish';
      return videoProvider.generateVideoClip({
        imageUrl,
        motionPrompt: `${motionPrompt} | the person speaks ${language}, saying exactly: "${scene.text}"`,
        duration: scene.duration,
        aspectRatio: job.aspect_ratio,
      });
    }

    const [videoBuffer, audioBuffer] = await Promise.all([
      videoProvider.generateVideoClip({
        imageUrl,
        motionPrompt,
        duration: scene.duration,
        aspectRatio: job.aspect_ratio,
      }),
      this.ttsProvider.synthesize({
        text: scene.text,
        language: job.voice_language,
        gender: job.voice_gender,
      }),
    ]);
    return this.ffmpeg.mixAudioVideo(videoBuffer, audioBuffer);
  }

  // Used for video pipeline: always generates fresh AI image using product research
  private async generateProductImage(job: Job, references: ResolvedReference[] = []): Promise<Buffer> {
    const subject = job.product_name ?? job.prompt_character ?? 'Product';
    let context = job.product_research
      ? `${subject}\n\nProduct context: ${job.product_research.substring(0, 600)}`
      : subject;
    if (references.length) {
      context += `\n\nReal reference photos are provided for: ${references
        .map((r) => `"${r.tag}" (${r.description?.slice(0, 150) ?? 'no description'})`)
        .join('; ')}. The prompt must state that these EXACT subjects/locations appear in the image as in the reference photos.`;
    }
    const prompt = await this.claude.craftImagePrompt(context, job.content_type, job.aspect_ratio);
    const imageProvider = this.imageRegistry.getProvider(job.image_model);
    const referenceImageUrls = this.flattenReferenceUrls(references);
    return imageProvider.generateImage({
      prompt,
      aspectRatio: job.aspect_ratio,
      referenceImageUrls: referenceImageUrls.length ? referenceImageUrls : undefined,
    });
  }

  // Bir tag (klasör) birden fazla foto tutabildiği için görsel üretimine giden
  // referans sayısını sağlıklı bir üst sınırda tutar (nano-banana-edit maks 10 alır).
  private flattenReferenceUrls(groups: ResolvedReference[]): string[] {
    const urls: string[] = [];
    for (const g of groups) {
      for (const u of g.urls.slice(0, MAX_REFS_PER_TAG)) {
        if (urls.length >= MAX_TOTAL_REF_IMAGES) return urls;
        urls.push(u);
      }
    }
    return urls;
  }

  // Etiketli referansları çözer: elle seçilmişse onları getirir, yoksa Claude
  // kütüphanedeki açıklamalara bakıp senaryoyla eşleştirir. Sonuç tag bazında
  // gruplanır — her tag bir "klasör", birden fazla foto/video karesi tutabilir.
  // Tablo henüz yoksa veya hata olursa referanssız devam edilir.
  private async resolveReferences(job: Job, script: string): Promise<ResolvedReference[]> {
    try {
      if (job.reference_tags?.length) {
        const photos = await this.db.getReferencePhotosByTags(job.reference_tags, job.organization_id);
        return this.groupByTag(photos);
      }
      const all = await this.db.listReferencePhotos(job.organization_id);
      if (all.length === 0) return [];
      const groups = this.groupByTag(all);
      const context = `Product: ${job.product_name ?? ''}\nBrief: ${job.video_brief ?? ''}\nScript: ${script}`;
      const matched = await this.claude.matchReferenceTags(
        context,
        groups.map((g) => ({ tag: g.tag, description: g.description })),
      );
      return groups.filter((g) => matched.includes(g.tag));
    } catch (err) {
      this.logger.warn(`Referans çözümleme atlandı: ${err instanceof Error ? err.message : err}`);
      return [];
    }
  }

  private groupByTag(photos: ReferencePhoto[]): ResolvedReference[] {
    const map = new Map<string, ResolvedReference>();
    for (const p of photos) {
      const existing = map.get(p.tag);
      if (existing) {
        existing.urls.push(p.url);
        if (!existing.description && p.description) existing.description = p.description;
      } else {
        map.set(p.tag, { tag: p.tag, description: p.description, urls: [p.url] });
      }
    }
    return [...map.values()];
  }

  // Arka plan müziği: music_mode'a göre havuzdan seçer veya Suno ile üretir,
  // final videonun altına ducking'li miksler. Müzik hatası işi düşürmez.
  private async applyMusic(jobId: string, job: Job, videoBuffer: Buffer, script: string): Promise<Buffer> {
    const mode = job.music_mode ?? 'none';
    if (mode === 'none') return videoBuffer;

    try {
      let musicBuffer: Buffer;

      if (mode === 'library') {
        const files = fs.existsSync(MUSIC_LIBRARY_DIR)
          ? fs.readdirSync(MUSIC_LIBRARY_DIR).filter((f) => /\.(mp3|m4a|wav)$/i.test(f))
          : [];
        if (files.length === 0) {
          this.logger.warn(`[${jobId}] Müzik havuzu boş (${MUSIC_LIBRARY_DIR}) — müzik atlanıyor`);
          return videoBuffer;
        }
        const moods = files.map((f) => path.parse(f).name);
        const mood = await this.claude.pickMusicMood(script, job.content_type, moods, job.music_style);
        const file = files[moods.indexOf(mood)] ?? files[0];
        this.logger.log(`[${jobId}] Müzik (havuz): ${file}`);
        musicBuffer = fs.readFileSync(path.join(MUSIC_LIBRARY_DIR, file));
      } else {
        const { style, title } = await this.claude.craftMusicPrompt(script, job.content_type, job.music_style);
        this.logger.log(`[${jobId}] Müzik (AI): "${title}" — ${style.slice(0, 80)}...`);
        musicBuffer = await this.suno.generateInstrumental(style, title);
      }

      return await this.ffmpeg.mixMusicUnderVoice(videoBuffer, musicBuffer);
    } catch (err) {
      this.logger.warn(`[${jobId}] Müzik eklenemedi, müziksiz devam: ${err instanceof Error ? err.message : err}`);
      return videoBuffer;
    }
  }

  // Used for static pipelines (meme, product_shot): respects reference image if provided
  private async getImage(job: Job): Promise<Buffer> {
    if (job.reference_image_url) {
      this.logger.log(`Using reference image: ${job.reference_image_url}`);
      const res = await fetch(job.reference_image_url);
      if (!res.ok) throw new Error(`Reference image download failed: ${res.statusText}`);
      return Buffer.from(await res.arrayBuffer());
    }
    return this.generateProductImage(job);
  }
}
