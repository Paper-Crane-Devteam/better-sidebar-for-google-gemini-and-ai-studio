import { bg48DataUrl, bg96DataUrl, bg100DataUrl } from './imageFile';

/**
 * Watermark Removal Engine
 * Ported from 'gemini-watermark-remover-chrome-main/content.js'
 * Rewritten as typed TypeScript module.
 */

// ============= Constants =============
const ALPHA_THRESHOLD = 0.002;
const MAX_ALPHA = 0.99;
const LOGO_VALUE = 255;

// ============= Types =============
interface WatermarkPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  size: number;
}

// ============= Alpha Map Calculator =============
function calculateAlphaMap(imageData: ImageData): Float32Array {
  const { width, height, data } = imageData;
  const alphaMap = new Float32Array(width * height);
  for (let i = 0; i < alphaMap.length; i++) {
    const idx = i * 4;
    alphaMap[i] = Math.max(data[idx], data[idx + 1], data[idx + 2]) / 255.0;
  }
  return alphaMap;
}

// ============= Reverse Alpha Blending =============
function removeWatermark(
  imageData: ImageData,
  alphaMap: Float32Array,
  position: WatermarkPosition,
): void {
  const { x, y, width, height } = position;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const imgIdx = ((y + row) * imageData.width + (x + col)) * 4;
      const alphaIdx = row * width + col;

      let alpha = alphaMap[alphaIdx];
      if (alpha < ALPHA_THRESHOLD) continue;
      alpha = Math.min(alpha, MAX_ALPHA);

      for (let c = 0; c < 3; c++) {
        const watermarked = imageData.data[imgIdx + c];
        const original = (watermarked - alpha * LOGO_VALUE) / (1.0 - alpha);
        imageData.data[imgIdx + c] = Math.max(0, Math.min(255, Math.round(original)));
      }
    }
  }
}

// ============= Watermark Config Detection =============
function getWatermarkInfo(width: number, height: number): WatermarkPosition {
  const isXLarge = width > 2048 || height > 2048;
  const isLarge = width > 1024 && height > 1024;

  let size: number;
  let margin: number;
  if (isXLarge) {
    size = 100;
    margin = 63;
  } else if (isLarge) {
    size = 96;
    margin = 64;
  } else {
    size = 48;
    margin = 32;
  }

  return {
    size,
    x: Math.floor(width - margin - size),
    y: Math.floor(height - margin - size),
    width: size,
    height: size,
  };
}

// ============= Image Loader =============
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ============= Watermark Engine =============
export class WatermarkEngine {
  private bgImages: Record<number, HTMLImageElement> = {};
  private alphaMaps: Record<number, Float32Array> = {};

  private constructor(images: Record<number, HTMLImageElement>) {
    this.bgImages = images;
  }

  static async create(): Promise<WatermarkEngine> {
    try {
      const [bg48, bg96, bg100] = await Promise.all([
        loadImage(bg48DataUrl),
        loadImage(bg96DataUrl),
        loadImage(bg100DataUrl),
      ]);
      return new WatermarkEngine({ 48: bg48, 96: bg96, 100: bg100 });
    } catch (e) {
      console.error('Failed to load watermark assets.', e);
      throw e;
    }
  }

  private async getAlphaMap(size: number): Promise<Float32Array> {
    if (this.alphaMaps[size]) return this.alphaMaps[size];

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    // Use native template if available, otherwise pick closest and scale
    const srcImg = this.bgImages[size]
      ?? this.bgImages[size <= 48 ? 48 : size <= 96 ? 96 : 100];
    ctx.drawImage(srcImg, 0, 0, size, size);
    const map = calculateAlphaMap(ctx.getImageData(0, 0, size, size));
    this.alphaMaps[size] = map;
    return map;
  }

  async process(blobUrl: string): Promise<Blob> {
    const img = await loadImage(blobUrl);

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const config = getWatermarkInfo(canvas.width, canvas.height);
    const alphaMap = await this.getAlphaMap(config.size);

    removeWatermark(imageData, alphaMap, config);
    ctx.putImageData(imageData, 0, 0);

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('Canvas toBlob failed'));
      }, 'image/png');
    });
  }
}
