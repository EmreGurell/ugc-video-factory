# UGC Video Factory

AI pipeline: prompt → UGC fotoğraf → sahne klipleri → final video → Flutter mobil uygulama.

## Stack (fal.ai TAMAMEN kaldırıldı — 2026-07; Supabase TAMAMEN kaldırıldı — 2026-07-20)
- Backend: NestJS + TypeScript (port 3000), hedef host: Railway
- Queue: BullMQ + Redis (`docker compose up -d`)
- AI Görsel: kie.ai Nano Banana (`google/nano-banana`, referanslı: `google/nano-banana-edit`, pro: `nano-banana-pro`)
- AI Video: kie.ai Kling 2.1 (`kling/v2-1-standard|pro`), Sora 2, Veo 3 (`veo3_fast`, native ses+konuşma)
- AI Ses: ElevenLabs — `ELEVENLABS_API_KEY` tanımlıysa doğrudan API, yoksa kie.ai proxy (`elevenlabs/text-to-speech-multilingual-v2`); tek KIE anahtarıyla tüm sistem çalışır
- AI Müzik: kie.ai Suno (`V4_5`, enstrümantal) veya hazır havuz (`backend/assets/music/*.mp3`)
- AI Birleştirme: local `fluent-ffmpeg` (sistem ffmpeg gerekli: `brew install ffmpeg`); müzik ducking'li mikslenir
- AI Metin: Anthropic Claude (`claude-sonnet-4-6`)
- Storage: Cloudflare R2 (S3 uyumlu, `@aws-sdk/client-s3`) — `backend/src/storage/storage.service.ts`
- Database: Railway PostgreSQL + Prisma ORM (`users`, `refresh_tokens`, `jobs`, `reference_photos` tabloları) — `backend/prisma/schema.prisma`, `backend/src/database/`
- Auth: kendi JWT sistemi (`backend/src/auth/`) — email+şifre (bcryptjs), access token 15dk (`@nestjs/jwt`+passport-jwt), opaque refresh token DB'de SHA-256 hash'lenip rotate edilir (30 gün). `jobs`/`reference_photos` `user_id` ile sahiplenir; `JwtAuthGuard` tüm `/jobs` ve `/references` endpoint'lerini korur
- Mobile: Flutter + `image_picker` (3 sekme: İşler / Oluştur / Referanslar) + login/register ekranları, `flutter_secure_storage` ile token saklama, `ApiService` 401'de otomatik refresh+retry yapar
- Onboarding: ilk açılışta `OnboardingScreen` (3 slayt) + `shared_preferences` ile bir kere gösterilir (`onboarding_seen`); login sonrası "Oluştur" sekmesine tek seferlik coach-mark overlay'i (`coachmark_create_tab_seen`) — `mobile/lib/services/onboarding_service.dart`, `mobile/lib/main.dart` (`AuthGate` sırası: onboarding → login/home)
- Push Bildirimleri (Android öncelikli — 2026-07-20): Firebase Cloud Messaging. Backend `firebase-admin` (`backend/src/notifications/`) — `firebase-service-account.json` yoksa sessizce devre dışı kalır, pipeline'ı etkilemez. `PipelineService` job `completed`/`failed` olunca `POST /notifications/register-token` ile kayıtlı cihaz token'larına push gönderir, geçersiz token'ları otomatik siler. Mobil: `firebase_messaging`+`flutter_local_notifications` (`mobile/lib/services/push_notification_service.dart`), `MainShell.initState()`'te tetiklenir; `Firebase.initializeApp()` `main()`'de try/catch içinde — platform config dosyası (`google-services.json`/`GoogleService-Info.plist`) yoksa uygulama push'suz çalışmaya devam eder (iOS'ta henüz `GoogleService-Info.plist` YOK, bilerek — hedef platform Android). Android paket adı `com.ugcfactory.mobile`, gradle wiring yapıldı (`com.google.gms.google-services` plugin) ama bu makinede Android SDK olmadığından gerçek Android derlemesi doğrulanamadı — ilk Android build'de kontrol edilmeli.

## Etiketli Referans Kütüphanesi (klasör yapısı — 2026-07)
- Bir etiket (tag) bir "klasör": birden fazla foto/video karesi tutabilir (`reference_photos.tag` artık UNIQUE değil)
- `POST /references` (multipart image+tag, insert), `POST /references/extract-frames` (multipart video → 10 kare adayı URL), `POST /references/confirm-frame` (tag+frame_url → kayıt), `GET /references`, `DELETE /references/:tag` (klasörü tamamen siler), `DELETE /references/item/:id` (tek öğe)
- Video referans akışı: mobilde video seçilir → backend `FfmpegService.extractFrames()` ile 10 eşit aralıklı kare çıkarır → kullanıcı ızgaradan birini seçer → `confirm-frame` ile kalıcı kayda döner (Claude o kareyi analiz eder)
- Upload'ta Claude görseli analiz edip `description` yazar
- Job'da `reference_tags[]` elle seçilir; boşsa `matchReferenceTags()` otomatik eşleştirir
- Pipeline'da `resolveReferences()` sonucu tag bazında gruplanır (`ResolvedReference{tag,description,urls[]}`); görsel üretimine tag başına maks 3, toplam maks 8 görsel gider (`nano-banana-edit image_urls`)
- Story: sahne 2+ görselleri scene-0 + tag klasöründen 2 görsel referanslı üretilir; `suppressReferencePerson` ile tag fotoğrafındaki olası kişi (ör. dükkan sahibi) karaktere karışması engellenir
- Mobil: Referanslar sekmesi klasör grid'i (`reference_folder.dart`, `reference_library_screen.dart`); Oluştur ekranında klasör başına tek chip

## Müzik
- `music_mode: none|library|ai` + `music_style` (job bazında)
- library → `assets/music/{mood}.mp3` içinden Claude seçer; ai → Suno enstrümantal üretir
- ffmpeg `mixMusicUnderVoice`: sidechaincompress ducking (konuşmada müzik kısılır), fade in/out
- Müzik hatası işi düşürmez — müziksiz devam eder

## İçerik Tipleri (13 adet)
- **Video:** `ugc_selfie`, `ugc_walking`, `ugc_car`, `unboxing`, `testimonial`, `grwm`, `story`, `lifestyle`, `product_demo`, `text_animation`
- **Statik:** `meme`, `product_shot`, `before_after`

`story` (Hikâye/Vlog) diğer video tiplerinden farklı çalışır: `planStory()` senaryoyu kronolojik anlara böler ve **her sahne için ayrı görsel** üretilir (`{jobId}/scene-N.jpg`). İlk sahne görselinin Claude analizi, karakter tutarlılığı için sonraki sahne promptlarına enjekte edilir.

## Pipeline Adımları
```
VIDEO tipler:
1. Claude  → karakter açıklamasından UGC image prompt üret
2. fal.ai  → FLUX ile fotorealistik UGC fotoğrafı oluştur
   (referans fotoğraf yüklendiyse 1-2 atlanır)
3. Supabase→ fotoğrafı storage'a yükle (ugc-assets/{jobId}/image.jpg)
4. Claude  → görseli analiz et (görünüm, ortam, ışık)
5. Claude  → senaryoyu ~10 saniyelik sahnelere böl (JSON array; Kling yalnızca 5s/10s destekler, 8 göndermek 5'e yuvarlanıyordu)
6. fal.ai  → her sahne için Kling ile image-to-video klip oluştur (sıralı)
   + ElevenLabs TTS ile ses üret (paralel)
   + ffmpeg ile ses+video mix
7. Supabase→ her klibi storage'a yükle (ugc-assets/{jobId}/clip-N.mp4)
8. ffmpeg  → tüm klipler birleştirilir (local fluent-ffmpeg)
9. Supabase→ final videoyu yükle → job.final_video_url → status: completed

MEME: görsel üret → Claude caption → sharp SVG overlay
PRODUCT SHOT: görsel üret → direkt teslim
BEFORE/AFTER: 2 görsel paralel üret → sharp composite
```

## Dizin Yapısı
```
backend/src/
  jobs/          → HTTP controller + BullMQ processor
  pipeline/      → claude.service, pipeline.service, overlay.service
  database/      → PrismaService + DatabaseService (job/reference_photos CRUD)
  storage/       → StorageService (Cloudflare R2, S3 uyumlu)
backend/prisma/schema.prisma → DB şeması (Job, ReferencePhoto)
```

## Quick Start
```bash
cd backend
npm install             # postinstall: prisma generate
cp .env.example .env    # API anahtarlarını + DATABASE_URL + R2_* doldur
docker compose up -d    # Redis + yerel Postgres başlat
npx prisma migrate dev  # ilk kurulumda / şema değiştiğinde
npm run start:dev
```

## REST API
```
POST /jobs/upload-reference  multipart: image → { url }  (referans fotoğraf yükle)
POST /jobs    { character_description, script, aspect_ratio?, content_type?,
               voice_language?, voice_gender?, reference_image_url? }
              → 202 { job_id }

GET  /jobs/:id → { id, status, image_url, final_video_url, error_message, created_at }
GET  /jobs     → son 20 iş
```

## Job Status Değerleri
`pending` → `generating_image` → `analyzing_image` → `breaking_scenes` → `generating_clips` → `stitching` → `completed` | `failed`
Statik: `generating_image` → `compositing` → `completed`

## Environment Variables
```
ANTHROPIC_API_KEY=
REDIS_URL=redis://localhost:6379
PORT=3000
KIE_API_KEY=            # video + görsel + müzik + TTS (zorunlu)
ELEVENLABS_API_KEY=     # opsiyonel — tanımlıysa TTS doğrudan ElevenLabs'ten gider

DATABASE_URL=            # Railway Postgres connection string (yerelde docker compose postgres)
R2_ACCOUNT_ID=            # Cloudflare R2
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=ugc-assets
R2_PUBLIC_URL=            # https://pub-xxx.r2.dev veya custom domain

FIREBASE_SERVICE_ACCOUNT_PATH=firebase-service-account.json  # opsiyonel, yoksa push devre dışı

JWT_ACCESS_SECRET=       # rastgele uzun bir string (openssl rand -hex 48)
```

## Auth API
```
POST /auth/register  { email, password } → 201 { access_token, refresh_token, user }
POST /auth/login     { email, password } → { access_token, refresh_token, user }
POST /auth/refresh   { refresh_token }   → yeni çift (eski refresh token rotate edilir, tekrar kullanılamaz)
POST /auth/logout    { refresh_token }   → { ok: true }
```
`/jobs` ve `/references` altındaki tüm endpoint'ler `Authorization: Bearer <access_token>` ister.

## Database Schema (Prisma — `backend/prisma/schema.prisma`)
Kaynak doğrusu artık Prisma şeması; SQL burada sadece referans amaçlı:
```sql
create table jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending',
  prompt_character text,
  prompt_script text,
  aspect_ratio text not null default '9:16',
  content_type text not null default 'ugc_selfie',
  voice_language text not null default 'tr',
  voice_gender text not null default 'female',
  reference_image_url text,
  image_url text,
  scenes jsonb,
  clip_urls text[],
  final_video_url text,
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

## Sonraki Adım: kie.ai'ye Geçiş (maliyet optimizasyonu)

Mevcut fal.ai vs kie.ai karşılaştırması (3 klip × 5s video başına):

| Kalem | fal.ai (mevcut) | kie.ai |
|---|---|---|
| Kling 2.1 Standard 5s | $0.40/klip | **$0.125/klip** |
| 3 klip toplam | $1.20 | $0.375 |
| FLUX görsel | $0.025 | ~aynı |
| ElevenLabs TTS | ~$0.03 | ~$0.03 (direkt) |
| **Toplam/video** | **~$1.27** | **~$0.45** |
| 1.000 video/ay | ~$1.270 | ~$450 |

**%65 tasarruf, aynı Kling 2.1 modeli.**

Alternatif: kie.ai Veo 3 Fast ($0.40/8s, ses dahil) → TTS gerekmez, Google'ın son modeli.
- 3 klip: ~$1.20/video — fal.ai ile aynı fiyat ama daha kaliteli + native audio

### kie.ai Geçişi (yapıldı — 2026-07)
- Video provider'lar gerçek kie.ai API'sine göre yazıldı:
  - Kling/Sora2: `POST /api/v1/jobs/createTask` + `GET /api/v1/jobs/recordInfo?taskId=` (ortak istemci: `kie-jobs.client.ts`; state: waiting/queuing/generating/success/fail, sonuç `resultJson.resultUrls[0]`)
  - Veo 3: `POST /api/v1/veo/generate` + `GET /api/v1/veo/record-info?taskId=` (`successFlag`: 0/1/2/3), model `veo3_fast`, native ses
  - Model adları: `kling/v2-1-standard`, `kling/v2-1-pro`, `sora-2-image-to-video`
- `KIE_API_KEY` **opsiyonel**: yoksa tüm kie modelleri fal.ai Kling'e düşer (açılışta çökmez)
- `kling_nano` kie market'te yok → registry'de standard'a eşlenir (mobil chip kaldırıldı)
