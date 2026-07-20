import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

@Injectable()
export class OverlayService {
  async addMemeText(
    imageBuffer: Buffer,
    topText: string,
    bottomText: string,
  ): Promise<Buffer> {
    const meta = await sharp(imageBuffer).metadata();
    const width = meta.width ?? 720;
    const height = meta.height ?? 1280;

    const fontSize = Math.round(width * 0.1);
    const strokeWidth = Math.round(fontSize * 0.08);
    const paddingY = Math.round(height * 0.04);

    const escapedTop = this.escapeXml(topText.toUpperCase());
    const escapedBottom = this.escapeXml(bottomText.toUpperCase());

    const svg = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    text {
      font-family: 'Arial Black', 'Impact', sans-serif;
      font-weight: 900;
      font-size: ${fontSize}px;
      text-anchor: middle;
      dominant-baseline: auto;
    }
  </style>
  <!-- Top text -->
  <text
    x="${width / 2}" y="${paddingY + fontSize}"
    fill="white"
    stroke="black"
    stroke-width="${strokeWidth}"
    stroke-linejoin="round"
    paint-order="stroke"
  >${escapedTop}</text>
  <!-- Bottom text -->
  <text
    x="${width / 2}" y="${height - paddingY}"
    fill="white"
    stroke="black"
    stroke-width="${strokeWidth}"
    stroke-linejoin="round"
    paint-order="stroke"
  >${escapedBottom}</text>
</svg>`;

    return sharp(imageBuffer)
      .composite([{ input: Buffer.from(svg), blend: 'over' }])
      .png()
      .toBuffer();
  }

  async compositeBeforeAfter(
    beforeBuffer: Buffer,
    afterBuffer: Buffer,
    aspectRatio: string,
  ): Promise<Buffer> {
    const isVertical = aspectRatio === '9:16';
    const meta = await sharp(beforeBuffer).metadata();
    const w = meta.width ?? 720;
    const h = meta.height ?? 1280;

    const labelFontSize = Math.round(Math.min(w, h) * 0.06);
    const labelPad = Math.round(labelFontSize * 0.5);

    const resizedBefore = await sharp(beforeBuffer)
      .resize(w, h, { fit: 'cover' })
      .toBuffer();
    const resizedAfter = await sharp(afterBuffer)
      .resize(w, h, { fit: 'cover' })
      .toBuffer();

    const makeLabelSvg = (text: string, imgW: number, imgH: number) => `
<svg width="${imgW}" height="${imgH}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${labelPad}" y="${labelPad}" width="${text.length * labelFontSize * 0.65 + labelPad * 2}" height="${labelFontSize + labelPad * 2}" rx="8" fill="rgba(0,0,0,0.55)"/>
  <text x="${labelPad * 2}" y="${labelPad + labelFontSize}" font-family="Arial Black, sans-serif" font-weight="900" font-size="${labelFontSize}px" fill="white">${text}</text>
</svg>`;

    const beforeLabelled = await sharp(resizedBefore)
      .composite([
        { input: Buffer.from(makeLabelSvg('BEFORE', w, h)), blend: 'over' },
      ])
      .toBuffer();

    const afterLabelled = await sharp(resizedAfter)
      .composite([
        { input: Buffer.from(makeLabelSvg('AFTER', w, h)), blend: 'over' },
      ])
      .toBuffer();

    if (isVertical) {
      // Stack vertically: before on top, after on bottom
      return sharp({
        create: { width: w, height: h * 2, channels: 3, background: '#000' },
      })
        .composite([
          { input: beforeLabelled, top: 0, left: 0 },
          { input: afterLabelled, top: h, left: 0 },
        ])
        .jpeg({ quality: 90 })
        .toBuffer();
    } else {
      // Side by side
      return sharp({
        create: { width: w * 2, height: h, channels: 3, background: '#000' },
      })
        .composite([
          { input: beforeLabelled, top: 0, left: 0 },
          { input: afterLabelled, top: 0, left: w },
        ])
        .jpeg({ quality: 90 })
        .toBuffer();
    }
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
