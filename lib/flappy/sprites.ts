/* Image loading plus DNA-tinted bird sprites, shared by the game and the explainer. */

import { installCanvasPolyfills } from "./polyfills";

export interface Sprites {
  background: HTMLImageElement;
  topPipe: HTMLImageElement;
  bottomPipe: HTMLImageElement;
  birdFrames: HTMLImageElement[];
}

const IMAGE_ROOT = "/assets/images";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

let spritesPromise: Promise<Sprites> | null = null;

export function loadSprites(): Promise<Sprites> {
  installCanvasPolyfills();
  spritesPromise ??= Promise.all([
    loadImage(`${IMAGE_ROOT}/flappybirdbg.png`),
    loadImage(`${IMAGE_ROOT}/toppipe.png`),
    loadImage(`${IMAGE_ROOT}/bottompipe.png`),
    Promise.all([0, 1, 2, 3].map((i) => loadImage(`${IMAGE_ROOT}/flappybird${i}.png`))),
  ]).then(([background, topPipe, bottomPipe, birdFrames]) => ({ background, topPipe, bottomPipe, birdFrames }));
  return spritesPromise;
}

/** Hues are bucketed so we only ever build a few dozen tinted sprites. */
export const HUE_BUCKETS = 36;
/** Tinted sprites are rasterised at 3x the 34x24 game size. */
const TINT_W = 102;
const TINT_H = 72;

export function hueBucket(hue: number) {
  return Math.round((((hue % 360) + 360) % 360) / (360 / HUE_BUCKETS)) % HUE_BUCKETS;
}

/**
 * Recolours only the bird's yellow/orange feathers, keeping the outline, eye
 * and red beak intact, so every tint still reads as Flappy Bird.
 */
export class TintCache {
  private frames: HTMLImageElement[];
  private cache = new Map<number, HTMLCanvasElement>();

  constructor(frames: HTMLImageElement[]) {
    this.frames = frames;
  }

  get(frame: number, hue: number): HTMLCanvasElement {
    const bucket = hueBucket(hue);
    const key = bucket * 8 + frame;
    let canvas = this.cache.get(key);
    if (!canvas) {
      canvas = this.build(this.frames[frame], (bucket * 360) / HUE_BUCKETS);
      this.cache.set(key, canvas);
    }
    return canvas;
  }

  private build(img: HTMLImageElement, targetHue: number): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = TINT_W;
    canvas.height = TINT_H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, TINT_W, TINT_H);
    const data = ctx.getImageData(0, 0, TINT_W, TINT_H);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) continue;
      const [h, s, l] = rgbToHsl(px[i], px[i + 1], px[i + 2]);
      // Feathers are yellow (~55deg) and orange (~40deg); the beak is red (~0deg).
      if (h < 25 || h > 75 || s < 0.35) continue;
      const shifted = (targetHue + (h - 52) + 360) % 360;
      const [r, g, b] = hslToRgb(shifted, Math.min(1, s * 0.95), l * 0.92);
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
    }
    ctx.putImageData(data, 0, 0);
    return canvas;
  }
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
