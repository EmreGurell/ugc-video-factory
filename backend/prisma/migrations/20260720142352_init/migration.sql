-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "content_type" TEXT NOT NULL DEFAULT 'ugc_selfie',
    "product_name" TEXT,
    "video_brief" TEXT,
    "product_research" TEXT,
    "draft_script" TEXT,
    "approved_script" TEXT,
    "prompt_character" TEXT,
    "prompt_script" TEXT,
    "aspect_ratio" TEXT NOT NULL DEFAULT '9:16',
    "scene_count" INTEGER NOT NULL DEFAULT 3,
    "video_style" TEXT NOT NULL DEFAULT 'dynamic',
    "voice_language" TEXT NOT NULL DEFAULT 'tr',
    "voice_gender" TEXT NOT NULL DEFAULT 'female',
    "reference_image_url" TEXT,
    "reference_tags" TEXT[],
    "music_mode" TEXT NOT NULL DEFAULT 'none',
    "music_style" TEXT,
    "image_model" TEXT NOT NULL DEFAULT 'nano_banana',
    "video_model" TEXT NOT NULL DEFAULT 'kling_standard',
    "image_url" TEXT,
    "scenes" JSONB,
    "clip_urls" TEXT[],
    "final_video_url" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_photos" (
    "id" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reference_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reference_photos_tag_idx" ON "reference_photos"("tag");
