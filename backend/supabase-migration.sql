-- Run this in Supabase SQL editor (Dashboard → SQL Editor → New query)
-- Safe to run multiple times (IF NOT EXISTS / IF EXISTS guards)

-- 1. Columns added in previous session
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS content_type text NOT NULL DEFAULT 'ugc_selfie',
  ADD COLUMN IF NOT EXISTS voice_language text NOT NULL DEFAULT 'tr',
  ADD COLUMN IF NOT EXISTS voice_gender text NOT NULL DEFAULT 'female',
  ADD COLUMN IF NOT EXISTS reference_image_url text;

-- 2. Columns added in current session (product pipeline)
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS product_name text,
  ADD COLUMN IF NOT EXISTS video_brief text,
  ADD COLUMN IF NOT EXISTS product_research text,
  ADD COLUMN IF NOT EXISTS draft_script text,
  ADD COLUMN IF NOT EXISTS approved_script text,
  ADD COLUMN IF NOT EXISTS scene_count int NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS video_style text NOT NULL DEFAULT 'dynamic';

-- 3. Make prompt_character and prompt_script nullable (new flow doesn't require them)
ALTER TABLE jobs
  ALTER COLUMN prompt_character DROP NOT NULL,
  ALTER COLUMN prompt_script DROP NOT NULL;

-- 4. Per-job model selection
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS image_model text NOT NULL DEFAULT 'flux_dev',
  ADD COLUMN IF NOT EXISTS video_model text NOT NULL DEFAULT 'kling_standard';

-- 5. Varsayılan görsel modeli artık nano_banana (fal.ai kaldırıldı, kie.ai'ye geçildi)
ALTER TABLE jobs ALTER COLUMN image_model SET DEFAULT 'nano_banana';

-- 6. Müzik + etiketli referans desteği
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS reference_tags text[],
  ADD COLUMN IF NOT EXISTS music_mode text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS music_style text;

-- 7. Etiketli referans fotoğraf kütüphanesi
CREATE TABLE IF NOT EXISTS reference_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag text NOT NULL UNIQUE,          -- 'kedi', 'dukkan', 'ben'...
  url text NOT NULL,                 -- storage: references/{tag}-{ts}.jpg
  description text,                  -- Claude'un görsel analizi (upload'ta üretilir)
  created_at timestamptz DEFAULT now()
);

-- 8. Etiket = klasör: bir etiket birden fazla foto/video karesi tutabilir
ALTER TABLE reference_photos DROP CONSTRAINT IF EXISTS reference_photos_tag_key;
CREATE INDEX IF NOT EXISTS idx_reference_photos_tag ON reference_photos(tag);
