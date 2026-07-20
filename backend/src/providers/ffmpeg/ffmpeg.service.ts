import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import ffmpeg = require('fluent-ffmpeg');

// Sahne geçişlerinde sert kesme yerine kısa crossfade (saniye)
const XFADE_DURATION = 0.25;
// TTS sesi videodan uzunsa en fazla bu kadar hızlandırılır
const MAX_AUDIO_TEMPO = 1.3;

@Injectable()
export class FfmpegService {
  private readonly logger = new Logger(FfmpegService.name);

  async stitchClips(clipUrls: string[]): Promise<Buffer> {
    if (clipUrls.length === 1) return this.downloadAsBuffer(clipUrls[0]);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ugc-stitch-'));
    try {
      const clipPaths: string[] = [];
      for (let i = 0; i < clipUrls.length; i++) {
        const buf = await this.downloadAsBuffer(clipUrls[i]);
        const p = path.join(tmpDir, `clip-${i}.mp4`);
        fs.writeFileSync(p, buf);
        clipPaths.push(p);
      }

      try {
        return await this.crossfadeConcat(clipPaths, tmpDir);
      } catch (err) {
        this.logger.warn(`Crossfade birleştirme başarısız, sert kesmeye düşülüyor: ${err instanceof Error ? err.message : err}`);
        const listPath = path.join(tmpDir, 'list.txt');
        fs.writeFileSync(listPath, clipPaths.map((p) => `file '${p}'`).join('\n'));
        const outputPath = path.join(tmpDir, 'output.mp4');
        await this.runConcat(listPath, outputPath);
        return fs.readFileSync(outputPath);
      }
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
    }
  }

  // Klipleri xfade (video) + acrossfade (ses) ile yumuşak geçişli birleştirir.
  // Re-encode gerektirir; -c copy concat'in ani zıplamasını ortadan kaldırır.
  private async crossfadeConcat(clipPaths: string[], tmpDir: string): Promise<Buffer> {
    const durations = await Promise.all(clipPaths.map((p) => this.probeDuration(p)));

    const cmd = ffmpeg();
    clipPaths.forEach((p) => cmd.input(p));

    const filters: string[] = [];
    let vPrev = '0:v';
    let aPrev = '0:a';
    let offset = 0;

    for (let i = 1; i < clipPaths.length; i++) {
      offset += durations[i - 1] - XFADE_DURATION;
      const vOut = `v${i}`;
      const aOut = `a${i}`;
      filters.push(
        `[${vPrev}][${i}:v]xfade=transition=fade:duration=${XFADE_DURATION}:offset=${offset.toFixed(3)}[${vOut}]`,
      );
      filters.push(`[${aPrev}][${i}:a]acrossfade=d=${XFADE_DURATION}[${aOut}]`);
      vPrev = vOut;
      aPrev = aOut;
    }

    const outputPath = path.join(tmpDir, 'xfade.mp4');
    await new Promise<void>((resolve, reject) => {
      cmd
        .complexFilter(filters)
        .outputOptions([
          `-map [${vPrev}]`,
          `-map [${aPrev}]`,
          '-c:v libx264',
          '-preset veryfast',
          '-crf 20',
          '-pix_fmt yuv420p',
          '-c:a aac',
          '-b:a 128k',
          '-movflags +faststart',
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .run();
    });

    return fs.readFileSync(outputPath);
  }

  // Sesi videonun süresine oturtur: video asla kesilmez.
  // Ses uzunsa hafifçe hızlandırılır (max 1.3x), kısaysa sessizlikle doldurulur.
  async mixAudioVideo(videoBuffer: Buffer, audioBuffer: Buffer): Promise<Buffer> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ugc-mix-'));
    try {
      const videoPath = path.join(tmpDir, 'video.mp4');
      const audioPath = path.join(tmpDir, 'audio.mp3');
      const outputPath = path.join(tmpDir, 'mixed.mp4');

      fs.writeFileSync(videoPath, videoBuffer);
      fs.writeFileSync(audioPath, audioBuffer);

      const [videoDur, audioDur] = await Promise.all([
        this.probeDuration(videoPath),
        this.probeDuration(audioPath),
      ]);

      const audioFilters: string[] = [];
      if (audioDur > videoDur) {
        const tempo = Math.min(audioDur / videoDur, MAX_AUDIO_TEMPO);
        audioFilters.push(`atempo=${tempo.toFixed(3)}`);
        if (audioDur / tempo > videoDur + 0.05) {
          this.logger.warn(
            `TTS sesi ${audioDur.toFixed(1)}s, video ${videoDur.toFixed(1)}s — ${MAX_AUDIO_TEMPO}x hızda bile sığmıyor, son kısmı kırpılacak`,
          );
        }
      }
      audioFilters.push('apad'); // kısa kalan sesi sessizlikle videonun sonuna kadar doldur

      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(videoPath)
          .input(audioPath)
          .audioFilters(audioFilters)
          .outputOptions(['-c:v copy', '-c:a aac', `-t ${videoDur.toFixed(3)}`])
          .output(outputPath)
          .on('end', () => resolve())
          .on('error', (err: Error) => reject(err))
          .run();
      });

      return fs.readFileSync(outputPath);
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
    }
  }

  // Arka plan müziğini mevcut sesin (voiceover / native ses) altına miksler.
  // Müzik kısaysa loop'lanır, video süresine kırpılır; sidechaincompress ile
  // ducking: konuşma anlarında müzik otomatik kısılır. Fade in/out uygulanır.
  async mixMusicUnderVoice(videoBuffer: Buffer, musicBuffer: Buffer): Promise<Buffer> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ugc-music-'));
    try {
      const videoPath = path.join(tmpDir, 'video.mp4');
      const musicPath = path.join(tmpDir, 'music.mp3');
      const outputPath = path.join(tmpDir, 'with-music.mp4');

      fs.writeFileSync(videoPath, videoBuffer);
      fs.writeFileSync(musicPath, musicBuffer);

      const videoDur = await this.probeDuration(videoPath);
      const fadeOutStart = Math.max(videoDur - 1.2, 0);

      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(videoPath)
          .input(musicPath)
          .inputOptions(['-stream_loop', '-1']) // müzik kısaysa döngüle
          .complexFilter([
            // müzik: video süresine kırp, seviye + fade
            `[1:a]atrim=0:${videoDur.toFixed(3)},volume=0.25,afade=t=in:d=0.8,afade=t=out:st=${fadeOutStart.toFixed(3)}:d=1.2[bg]`,
            // ducking: konuşma (0:a) yükselince müziği bastır
            `[bg][0:a]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[duck]`,
            // konuşma + kısılmış müzik
            `[0:a][duck]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[aout]`,
          ])
          .outputOptions([
            '-map 0:v',
            '-map [aout]',
            '-c:v copy',
            '-c:a aac',
            '-b:a 160k',
            `-t ${videoDur.toFixed(3)}`,
          ])
          .output(outputPath)
          .on('end', () => resolve())
          .on('error', (err: Error) => reject(err))
          .run();
      });

      return fs.readFileSync(outputPath);
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
    }
  }

  // Videodan eşit aralıklarla `count` kare çıkarır (referans kare seçimi için).
  // İlk ve son %5'lik kısım atlanır (genelde geçiş/karartma olur).
  async extractFrames(videoBuffer: Buffer, count = 10): Promise<Buffer[]> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ugc-frames-'));
    try {
      const videoPath = path.join(tmpDir, 'video.mp4');
      fs.writeFileSync(videoPath, videoBuffer);

      const duration = await this.probeDuration(videoPath);
      const margin = duration * 0.05;
      const usable = Math.max(duration - margin * 2, 0.1);

      const frames: Buffer[] = [];
      for (let i = 0; i < count; i++) {
        const t = margin + (usable * (i + 0.5)) / count;
        const framePath = path.join(tmpDir, `frame-${i}.jpg`);
        await new Promise<void>((resolve, reject) => {
          ffmpeg(videoPath)
            .seekInput(t)
            .outputOptions(['-frames:v 1', '-q:v 2'])
            .output(framePath)
            .on('end', () => resolve())
            .on('error', (err: Error) => reject(err))
            .run();
        });
        frames.push(fs.readFileSync(framePath));
      }
      return frames;
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
    }
  }

  private probeDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, data) => {
        if (err) return reject(err);
        const duration = data.format?.duration;
        if (!duration || duration <= 0) return reject(new Error(`Süre okunamadı: ${filePath}`));
        resolve(duration);
      });
    });
  }

  private runConcat(listPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(listPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c', 'copy'])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .run();
    });
  }

  async downloadAsBuffer(url: string): Promise<Buffer> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed ${url}: ${res.statusText}`);
    return Buffer.from(await res.arrayBuffer());
  }
}
