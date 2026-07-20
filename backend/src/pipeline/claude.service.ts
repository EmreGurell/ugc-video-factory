import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { ContentType } from '../jobs/dto/create-job.dto';
import { Scene } from '../database/database.service';

const MODEL = 'claude-sonnet-4-6';

// Shared anti-"AI look" cues appended to every UGC-style template so results
// read as real phone footage, not a polished stock photo.
export const UGC_REALISM_RULES = `- Shot on a modern iPhone, casual amateur framing: slightly off-center, slightly tilted, imperfect
- Realistic skin with visible pores and minor imperfections — NO beauty-filter smoothing, NO retouching
- Everyday clothing and a lived-in, slightly cluttered real background (not a staged set)
- Natural available light only (window daylight, warm lamp) — no studio lighting, no ring light glow
- Candid mid-moment expression, as if a frame grabbed from a real video — never a posed influencer smile
- The product must match the described color, logo, finish and design exactly, held or placed naturally`;

const IMAGE_PROMPT_TEMPLATES: Record<ContentType, string> = {
  ugc_selfie: `Create a detailed image generation prompt for a PHOTOREALISTIC UGC-style selfie video frame where the person is holding or using the described product.
Requirements:
- iPhone front camera at arm's length, close-up head and shoulders, product casually visible in frame or hand
- Person mid-sentence, talking to the camera like FaceTiming a friend — mouth slightly open, engaged eyes
- Shallow depth of field, softly blurred bedroom/kitchen/home background
${UGC_REALISM_RULES}`,

  ugc_walking: `Create a detailed image generation prompt for a PHOTOREALISTIC UGC walking vlog frame.
Requirements:
- Front camera held at arm's length while walking, vlog-style framing, head and chest visible
- Subject mid-stride and mid-sentence, hair slightly moving, natural walking posture
- Background street/park with slight motion blur suggesting movement, passersby out of focus
- NO phone visible in frame
${UGC_REALISM_RULES}`,

  ugc_car: `Create a detailed image generation prompt for a PHOTOREALISTIC UGC in-car video frame.
Requirements:
- Subject in the driver's seat of a parked car, casual dash-mount or hand-held camera feel
- "I have to tell you something" storytelling expression, mid-sentence, one hand gesturing
- Car interior visible: seatbelt, headrest, window with blurred daylight scenery
- NO phone visible in frame
${UGC_REALISM_RULES}`,

  unboxing: `Create a detailed image generation prompt for a PHOTOREALISTIC UGC unboxing video frame.
Requirements:
- Person at a desk or on the living-room floor, the product box just opened, hands on the packaging
- Genuine surprised-delighted candid expression, eyes on the product (not the camera)
- Framed like a phone propped up on the table, slightly high or low angle
- Packaging, product, colors and logo must match the description exactly
${UGC_REALISM_RULES}`,

  testimonial: `Create a detailed image generation prompt for a PHOTOREALISTIC customer testimonial video frame.
Requirements:
- Person seated on a couch or armchair at home, facing the camera, medium shot from the chest up
- Warm, sincere "let me tell you what happened" expression, mid-sentence, relaxed hands
- Camera at eye level as if propped across the room, cozy living room with depth behind
- Product casually present (on the coffee table or in hand), correct color and design
${UGC_REALISM_RULES}`,

  grwm: `Create a detailed image generation prompt for a PHOTOREALISTIC "get ready with me" video frame.
Requirements:
- Person at a bathroom or bedroom vanity mirror, mid-routine, applying or holding the product
- Framed like a phone leaning against the mirror or counter — casual vertical selfie-video feel
- Everyday clutter on the counter: skincare bottles, towel, hair clip; soft morning window light
- Focused candid expression, glancing at their reflection, not the lens
${UGC_REALISM_RULES}`,

  // story tipinde sahne görselleri planStory() ile üretilir; bu şablon yalnızca
  // Record<ContentType, string> bütünlüğü ve olası fallback için var.
  story: `Create a detailed image generation prompt for a PHOTOREALISTIC UGC storytime video frame.
Requirements:
- One candid moment from a bigger personal story (e.g. waiting in line, walking out of a store, reacting at home)
- Framed like a real phone video frame, person mid-action or mid-sentence
${UGC_REALISM_RULES}`,

  lifestyle: `Create a detailed image generation prompt for a CINEMATIC lifestyle ad photo.
Requirements:
- Wide or medium cinematic shot, subject in a natural environment genuinely using the product
- Shallow depth of field, golden hour or soft natural light, subtle film grain
- Premium editorial ad feel (think Apple or Nike brand film still), NOT a social-media selfie
- Subject caught mid-action, unaware of the camera — no posing, no eye contact with lens
- The product integrated naturally into the scene with correct color, finish and design`,

  product_demo: `Create a detailed image generation prompt for a first-person PRODUCT DEMO photo.
Requirements:
- POV or over-the-shoulder framing: real hands holding, opening or using the product mid-action
- The EXACT product described must be depicted accurately (correct color, shape, logo, form factor)
- Natural home or lifestyle environment with everyday props around, soft diffused window light
- Product sharp and prominent, background pleasantly blurred
- Hands with realistic skin texture — authentic "real customer filming on their phone" feel, not stock photo`,

  meme: `Create a detailed image generation prompt for a MEME BACKGROUND image.
Requirements:
- Simple, relatable scene that works as a meme template
- Clear empty space at TOP and BOTTOM for text overlay (avoid busy areas there)
- Expressive subject (surprised, confused, happy, smug — match the meme concept)
- Bold, high-contrast colors for visual impact
- Slightly over-the-top / dramatic composition`,

  product_shot: `Create a detailed image generation prompt for a CLEAN PRODUCT PHOTOGRAPHY shot.
Requirements:
- White, light grey, or minimal gradient studio background
- Product centered and well-lit with soft box lighting
- Clean shadows, professional commercial photography look
- No people unless the description specifies
- High detail, sharp focus on product`,

  before_after: `Create TWO separate image generation prompts for a BEFORE/AFTER comparison.
Return them as JSON: {"before": "prompt for before state", "after": "prompt for after state"}
Requirements:
- BEFORE: shows the problem/old state, slightly desaturated or dimmer
- AFTER: shows the result/new state, vibrant and positive
- Same subject/person/environment for visual continuity
- Each image must work as a standalone but pair visually`,

  text_animation: `Create a detailed image generation prompt for a CLEAN BACKGROUND for text animation.
Requirements:
- Minimal, abstract or gradient background with strong visual interest
- NO text in the image itself (text will be added as overlay)
- Subtle motion-friendly composition (works when animated)
- Brand-safe colors, modern aesthetic
- Could be: gradient, bokeh lights, abstract shapes, nature blur`,
};

const MOTION_TEMPLATES: Record<string, Record<'calm' | 'dynamic', string>> = {
  ugc_selfie: {
    calm:    'gentle head nods while talking, minimal handheld drift, soft blinks, calm blurred background',
    dynamic: 'expressive head movements, energetic handheld shake, fast gestures, punchy camera micro-jolts',
  },
  ugc_walking: {
    calm:    'slow steady walk, gentle camera float, smooth background drift, relaxed pace',
    dynamic: 'brisk walking bounce, quick direction changes, fast-passing background, vlog-energy camera bounce',
  },
  ugc_car: {
    calm:    'subtle car sway, slow head turns, gentle window scenery drift, relaxed atmosphere',
    dynamic: 'pronounced car vibration, quick head movements, fast-moving window scenery, energetic feel',
  },
  unboxing: {
    calm:    'hands slowly lift the product from the box, deliberate reveal, gentle head tilt of admiration, steady propped camera',
    dynamic: 'excited hands tear into packaging, quick product lift and turn toward camera, delighted reaction, lively handheld energy',
  },
  testimonial: {
    calm:    'still seated posture, gentle nods and small hand gestures while talking, warm steady eye contact, tripod-still frame',
    dynamic: 'animated storytelling gestures, leaning toward camera for emphasis, expressive face changes, slight camera drift',
  },
  grwm: {
    calm:    'unhurried routine movements, product applied gently, soft glances between mirror and camera, stable propped phone',
    dynamic: 'quick routine steps, product grabbed and shown to camera, playful energy, snappy movements between mirror and lens',
  },
  story: {
    calm:    'natural in-the-moment movement fitting the scene, gentle handheld phone drift, unhurried storytelling pace',
    dynamic: 'lively in-the-moment action fitting the scene, energetic handheld phone movement, excited vlog pacing',
  },
  lifestyle: {
    calm:    'slow cinematic dolly, subject drifts gently, golden hour bokeh barely shifts, meditative pace',
    dynamic: 'quick dolly push-in, subject moves decisively, bokeh swirls, sharp editorial energy',
  },
  product_demo: {
    calm:    'hands move slowly and deliberately, gentle product rotation, soft camera breathing, unhurried',
    dynamic: 'hands move quickly with excitement, rapid product angles, camera zooms in on features, high energy',
  },
  text_animation: {
    calm:    'very slow Ken Burns drift, barely perceptible zoom, ultra-stable for text readability',
    dynamic: 'fast Ken Burns zoom, parallax layers shift quickly, energetic background movement',
  },
};

// Per-type guidance for writeScript: what kind of "real person" is speaking and how.
const SCRIPT_STYLE_HINTS: Partial<Record<ContentType, string>> = {
  ugc_selfie:  'Talking directly to camera like FaceTiming a close friend. First-person real experience, casual and warm.',
  ugc_walking: 'Talking while walking, slightly breathless casual energy — sharing a thought that just hit them.',
  ugc_car:     'Car monologue, "okay I have to tell you this before I forget" confession energy.',
  unboxing:    'Live first-impression reaction while opening the box: curiosity, then genuine delight at specific details.',
  testimonial: 'Sincere personal story arc: the problem they had, trying the product skeptically, the concrete result.',
  grwm:        'Get-ready-with-me routine chat; the product comes up naturally as one step of the routine, not as the topic.',
  story:       'Storytime vlog: narrating one real story with a beginning, middle and payoff, each part a different moment/place (e.g. queuing outside the store → the purchase → showing it off at home).',
  lifestyle:   'Grounded aspirational voiceover, storytelling tone — narrating a moment of their day, not addressing the viewer.',
  product_demo:'Hands-on walkthrough: "look at this" moments, pointing out one or two features while actually using it.',
  text_animation: 'Punchy short statements that work as on-screen text — one idea per sentence, rhythm matters.',
};

export const LANGUAGE_NAMES: Record<string, string> = {
  tr: 'Turkish (Türkçe)',
  kk: 'Kazakh (Қазақша)',
  en: 'English',
  ru: 'Russian (Русский)',
};

export interface ReferenceTagInfo {
  tag: string;
  description?: string;
}

export interface MemeCaption {
  top: string;
  bottom: string;
}

export interface StoryPlan {
  /** Locked description of the one person appearing in every scene (English) */
  character: string;
  scenes: Scene[];
}

@Injectable()
export class ClaudeService implements OnModuleInit {
  private client: Anthropic;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    this.client = new Anthropic({
      apiKey: this.config.getOrThrow('ANTHROPIC_API_KEY'),
    });
  }

  async craftImagePrompt(
    characterDescription: string,
    contentType: ContentType,
    aspectRatio: string,
  ): Promise<string> {
    const template = IMAGE_PROMPT_TEMPLATES[contentType];
    const orientation =
      aspectRatio === '9:16' ? 'vertical 9:16 portrait' : 'horizontal 16:9 landscape';

    if (contentType === 'before_after') {
      // Returns JSON string for before/after — handled separately
      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `${template}

Subject/Concept: ${characterDescription}
Orientation: ${orientation}

Return ONLY valid JSON with keys "before" and "after". No markdown, no explanation.`,
          },
        ],
      });
      return (response.content[0] as Anthropic.TextBlock).text;
    }

    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `${template}

Subject/Scene: ${characterDescription}
Orientation: ${orientation}

Return ONLY the image generation prompt text. No explanation, no markdown.`,
        },
      ],
    });

    return (response.content[0] as Anthropic.TextBlock).text;
  }

  async analyzeImage(imageUrl: string): Promise<string> {
    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'url', url: imageUrl } },
            {
              type: 'text',
              text: `Describe this image in detail for video generation consistency. Include:
- Person's appearance (age range, hair, clothing, skin tone) if present
- Setting/background (room type, outdoors, car interior, etc.)
- Lighting quality and direction
- Camera angle and framing
- Overall mood and tone
Be specific and factual.`,
            },
          ],
        },
      ],
    });
    return (response.content[0] as Anthropic.TextBlock).text;
  }

  // story tipi: sahneler arası karakter tutarlılığı için SADECE kişiyi tarif eder.
  // analyzeImage'dan farkı: mekân/ışık/kadraj içermez — o bilgiler yeni sahnenin
  // kendi mekân tarifiyle çelişip karakteri bozuyordu.
  async describePerson(imageUrl: string): Promise<string> {
    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'url', url: imageUrl } },
            {
              type: 'text',
              text: `Describe ONLY the person in this image, for reproducing the exact same person in another image. Include:
- Age range, gender, ethnicity/skin tone
- Face: shape, notable features, eyebrows, eyes, nose, lips
- Hair: color, length, style, parting
- Exact outfit: every visible garment with colors, and accessories (jewelry, glasses, watch)
Do NOT mention the background, setting, lighting, camera or pose. One dense paragraph, be specific and factual.`,
            },
          ],
        },
      ],
    });
    return (response.content[0] as Anthropic.TextBlock).text;
  }

  async breakIntoScenes(
    script: string,
    imageAnalysis: string,
    contentType: ContentType,
    sceneCount = 3,
    videoStyle: 'calm' | 'dynamic' = 'dynamic',
  ): Promise<Scene[]> {
    const styleTemplates = MOTION_TEMPLATES[contentType] ?? {
      calm: 'slow gentle movement, minimal camera drift',
      dynamic: 'energetic movement, quick camera cuts, high energy',
    };
    const motionTemplate = styleTemplates[videoStyle];

    const styleDescription =
      videoStyle === 'calm'
        ? 'CALM and smooth — slow movements, minimal cuts, relaxed pacing'
        : 'DYNAMIC and energetic — fast movements, sharp cuts, high energy pacing';

    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `Break this script into exactly ${sceneCount} video scenes of ~10 seconds each.

Image analysis: ${imageAnalysis}
Video style: ${styleDescription}
Motion template: "${motionTemplate}"

Script:
${script}

Rules:
- Return EXACTLY ${sceneCount} scenes — split the script evenly
- Each "text": 20-26 words, enough to fill ~10 seconds of natural speech with no dead air
- Scene 1 "text" must keep the script's hook as its opening; the last scene carries the call to action
- Preserve the script's expressive punctuation ("...", "!", questions) in each "text" — the TTS voice uses it for intonation; do not flatten it
- "motion_prompt": in ENGLISH — camera and subject movement following the style above; keep the SAME person, outfit and setting as the image analysis in every scene, vary only the action/intensity
- Speech and gestures must feel mid-flow, natural, imperfect — like real UGC footage, not acted
- "duration": always 10
- No stage directions in "text", conversational voiceover only

Return ONLY a valid JSON array:
[{"text":"...","motion_prompt":"...","duration":10}]`,
        },
      ],
    });

    const raw = (response.content[0] as Anthropic.TextBlock).text;
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Claude did not return valid JSON scene array');
    return JSON.parse(match[0]) as Scene[];
  }

  // story tipi: senaryoyu kronolojik anlara böler; her sahne AYRI mekân/an ve
  // kendi görsel prompt'unu taşır. Karakter tarifi tüm sahnelerde sabitlenir.
  async planStory(
    script: string,
    productName: string,
    sceneCount = 3,
    videoStyle: 'calm' | 'dynamic' = 'dynamic',
    availableReferences: ReferenceTagInfo[] = [],
  ): Promise<StoryPlan> {
    const motionTemplate =
      MOTION_TEMPLATES.story[videoStyle] ?? 'natural handheld phone movement';

    const referenceBlock = availableReferences.length
      ? `\nReference photo library (real photos the user uploaded — use when a scene actually shows that subject):
${availableReferences.map((r) => `- tag "${r.tag}": ${r.description?.slice(0, 200) ?? 'no description'}`).join('\n')}
For each scene, if (and only if) it visually features one of these subjects, set "reference_tag" to that tag; otherwise omit it.`
      : '';

    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `Plan a multi-scene UGC "storytime" ad video. Split the story into exactly ${sceneCount} chronological scenes of ~10 seconds each. Each scene is a DIFFERENT moment and/or location of the same story (e.g. waiting in line outside the store → walking out with the bag → unboxing at home).

Product: ${productName}
Video style: ${videoStyle} — ${motionTemplate}
${referenceBlock}

Script (voiceover to distribute across scenes):
${script}

Return ONLY valid JSON:
{
  "character": "...",
  "scenes": [{"text": "...", "image_prompt": "...", "motion_prompt": "...", "duration": 10, "reference_tag": "optional"}]
}

Rules:
- "character": in ENGLISH — a locked description of the ONE person in this story: age range, gender, hair, skin tone, exact outfit and accessories. Same outfit in every scene unless the story requires otherwise.
- "text": voiceover in the SAME LANGUAGE as the script, 20-26 words per scene (~10 seconds of speech), natural spoken flow with no dead air; scene 1 keeps the script's hook, the last scene carries the call to action; preserve expressive punctuation ("...", "!", questions) — the TTS voice uses it for intonation
- "image_prompt": in ENGLISH — ONLY the setting, action, framing and mood of that scene as a candid phone-shot frame; do NOT describe the person (their description is appended separately); mention the product with its exact color/design where it appears
- "motion_prompt": in ENGLISH — camera and subject movement for image-to-video, following the video style above. If (and only if) the scene shows the person facing the camera and speaking, add "the person is talking on camera, lips and jaw moving naturally in speech"; for hands-only/POV/process scenes describe only the action, no talking
- "duration": always 10
- Scenes must read in chronological order and each must be visually distinct from the previous one`,
        },
      ],
    });

    const raw = (response.content[0] as Anthropic.TextBlock).text;
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Claude did not return valid story plan JSON');
    const plan = JSON.parse(match[0]) as StoryPlan;
    if (!plan.character || !Array.isArray(plan.scenes) || plan.scenes.length === 0) {
      throw new Error('Story plan JSON missing character or scenes');
    }
    return plan;
  }

  // Kullanıcı tag seçmediyse: kütüphanedeki etiketlerden senaryoyla gerçekten
  // ilgili olanları seçer (boş dizi dönebilir).
  async matchReferenceTags(
    context: string,
    references: ReferenceTagInfo[],
  ): Promise<string[]> {
    if (references.length === 0) return [];

    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `The user has a library of real reference photos, each with a tag. Decide which tags (if any) are genuinely relevant to this video — i.e. the video would visually show that subject.

Available tags:
${references.map((r) => `- "${r.tag}": ${r.description?.slice(0, 200) ?? 'no description'}`).join('\n')}

Video context (product, brief, script):
${context.slice(0, 2000)}

Return ONLY a JSON array of matching tag strings, e.g. ["kedi"] or []. Do not invent tags. Only include a tag if the subject would visibly appear in the video.`,
        },
      ],
    });

    const raw = (response.content[0] as Anthropic.TextBlock).text;
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
      const tags = JSON.parse(match[0]) as string[];
      const valid = new Set(references.map((r) => r.tag));
      return tags.filter((t) => valid.has(t));
    } catch {
      return [];
    }
  }

  // Hazır müzik havuzundan (assets/music) senaryoya uygun mood dosyasını seçer.
  async pickMusicMood(
    script: string,
    contentType: ContentType,
    availableMoods: string[],
    styleHint?: string,
  ): Promise<string> {
    if (availableMoods.length === 0) throw new Error('Müzik havuzu boş');
    if (availableMoods.length === 1) return availableMoods[0];

    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 64,
      messages: [
        {
          role: 'user',
          content: `Pick the best background music mood for this ad video.
Content type: ${contentType}
${styleHint ? `User's music preference: ${styleHint}` : ''}
Script: ${script.slice(0, 800)}

Available moods: ${availableMoods.join(', ')}

Return ONLY one of the available mood names, nothing else.`,
        },
      ],
    });

    const raw = (response.content[0] as Anthropic.TextBlock).text.trim().toLowerCase();
    return availableMoods.find((m) => raw.includes(m.toLowerCase())) ?? availableMoods[0];
  }

  // AI müzik (Suno) için stil prompt'u + başlık üretir.
  async craftMusicPrompt(
    script: string,
    contentType: ContentType,
    styleHint?: string,
  ): Promise<{ style: string; title: string }> {
    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `Write an instrumental background-music style description for a short UGC ad video (music sits UNDER a voiceover — no vocals, not too busy).
Content type: ${contentType}
${styleHint ? `User's music preference (follow it): ${styleHint}` : ''}
Script (for mood): ${script.slice(0, 800)}

Return ONLY valid JSON: {"style": "genre, mood, instruments, tempo — in English, max 400 chars", "title": "short title, max 60 chars"}`,
        },
      ],
    });

    const raw = (response.content[0] as Anthropic.TextBlock).text;
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Claude did not return valid music prompt JSON');
    return JSON.parse(match[0]) as { style: string; title: string };
  }

  async researchProduct(productName: string, imageUrl?: string): Promise<string> {
    const contentBlocks: Anthropic.MessageParam['content'] = [];

    if (imageUrl) {
      contentBlocks.push({ type: 'image', source: { type: 'url', url: imageUrl } });
    }

    contentBlocks.push({
      type: 'text',
      text: `Research the following product and provide a concise marketing analysis.

Product: ${productName}${imageUrl ? '\n(Product image provided above)' : ''}

Provide:
1. What the product is and what it does
2. Key benefits and unique selling points (USPs)
3. Target audience
4. Tone/style that fits this product (e.g. energetic, premium, friendly, professional)
5. Any notable features visible in the image

Be factual and concise. This analysis will be used to write a product video script.`,
    });

    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: contentBlocks }],
    });

    return (response.content[0] as Anthropic.TextBlock).text;
  }

  async writeScript(
    productName: string,
    research: string,
    contentType: ContentType,
    videoBrief?: string,
    languageCode = 'tr',
    sceneCount = 3,
    references: ReferenceTagInfo[] = [],
  ): Promise<string> {
    const styleHint = SCRIPT_STYLE_HINTS[contentType] ?? 'Natural, casual first-person tone.';
    const language = LANGUAGE_NAMES[languageCode] ?? LANGUAGE_NAMES.tr;
    const targetSeconds = sceneCount * 10;
    const targetWords = sceneCount * 24;

    // story tipinde referanslar varsa senaryo bu gerçek mekân/nesne sırasına göre
    // yazılmalı — yoksa sahne planlama adımı hangi sahnenin hangi referansa
    // karşılık geldiğini çıkaramıyor ve referanslar sessizce atlanıyor.
    const referenceBlock = references.length
      ? `\nThe user has REAL reference photos for these specific subjects/locations. The story MUST visit them in a natural chronological order, and each one must become its own clearly distinguishable moment in the script (narrated naturally, not as "sahne 1" labels — e.g. first arriving somewhere, then moving to the next place):
${references.map((r) => `- "${r.tag}": ${r.description?.slice(0, 200) ?? 'no description'}`).join('\n')}`
      : '';

    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Write a UGC-style ad video script for the following product. It must sound like a real person talking on camera, NOT like an advertisement.

Product: ${productName}
Format: ${contentType} — ${styleHint}
${videoBrief ? `Video topic / angle: ${videoBrief}` : ''}
${referenceBlock}

Product research:
${research}

LENGTH — this is critical:
- The video is ${targetSeconds} seconds long (${sceneCount} scenes × 10s). The script must fill it: aim for ${targetWords}-${targetWords + sceneCount * 3} words total (~${sceneCount + 2}-${sceneCount * 2} sentences)
- Too short means dead air on screen — do not under-write

CRAFT — what separates a scroll-stopper from a generic ad:
- The FIRST sentence is a hook: a question, a bold relatable claim, a confession, or the problem — never a greeting, never the product name in the first few words
- ${videoBrief ? `Build around the angle: "${videoBrief}"` : 'Pick the single most relatable benefit and build the story around it'}
- Give it an emotional arc: skepticism/problem → the moment it clicked → genuine enthusiasm. The energy should RISE through the script
- Be SPECIFIC, not generic: real numbers, times, places, sensations ("sabah 6.30'da", "üç gündür", "çantamda taşıyorum") — specificity is what makes it believable. Generic praise ("harika", "çok güzel", "bayıldım") is banned
- Everyday spoken language with natural rhythm, including small touches like "ya", "cidden", "bakın" (or equivalents in the target language)
- Include at least ONE concrete personal mini-moment (when/where they used it, what surprised them, who noticed)
- Write punctuation for VOICE DELIVERY: use "..." for dramatic pauses, "!" for excitement peaks, rhetorical questions for engagement — the text will be read aloud by TTS and punctuation shapes the intonation
- NO ad clichés ("devrim niteliğinde", "kaçırmayın", "fırsatı yakalayın" and equivalents), NO exaggerated claims, NO feature lists
- End with a soft, natural call to action — a recommendation to a friend, not a sales push
- Write in ${language}

Return ONLY the script text. No titles, no scene directions, no markdown.`,
        },
      ],
    });

    return (response.content[0] as Anthropic.TextBlock).text;
  }

  async generateMemeCaption(concept: string): Promise<MemeCaption> {
    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `Generate a funny, viral meme caption for this concept:
"${concept}"

Return ONLY valid JSON: {"top": "TOP TEXT", "bottom": "BOTTOM TEXT"}
Rules: all caps, punchy, max 6 words each, classic meme style.`,
        },
      ],
    });

    const raw = (response.content[0] as Anthropic.TextBlock).text;
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Claude did not return valid meme JSON');
    return JSON.parse(match[0]) as MemeCaption;
  }
}
