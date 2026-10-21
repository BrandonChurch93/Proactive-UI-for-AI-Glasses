import { Track } from './place';
import { BACKDROP, MOVE } from './tokens';

export function tierFor(lum: number): { alpha: number; weight: number } {
  const tier = BACKDROP.find((b) => lum > b.above) ?? BACKDROP[BACKDROP.length - 1]!;
  return { alpha: tier.alpha, weight: tier.weight };
}

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (l: number): number => (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055);

const relLum = (rgb: readonly number[]): number => 0.2126 * toLinear(rgb[0]!) + 0.7152 * toLinear(rgb[1]!) + 0.0722 * toLinear(rgb[2]!);

const GLASS_MID = [20 / 255, 25 / 255, 34 / 255];
export const INK = [251 / 255, 250 / 255, 246 / 255];
export const INK_2_ALPHA = 0.74;

export function contrast(textLum: number, bgLum: number): number {
  const hi = Math.max(textLum, bgLum);
  const lo = Math.min(textLum, bgLum);
  return (hi + 0.05) / (lo + 0.05);
}

export function paneBackground(backdropLum: number, alpha: number): number[] {
  const b = toSrgb(Math.max(0, Math.min(1, backdropLum)));
  return GLASS_MID.map((g) => g * alpha + b * (1 - alpha));
}

export function primaryContrast(backdropLum: number, alpha: number): number {
  return contrast(relLum(INK), relLum(paneBackground(backdropLum, alpha)));
}

export function secondaryContrast(backdropLum: number, alpha: number): number {
  const bg = paneBackground(backdropLum, alpha);
  const text = INK.map((c, i) => c * INK_2_ALPHA + bg[i]! * (1 - INK_2_ALPHA));
  return contrast(relLum(text), relLum(bg));
}

export class BackdropFill {
  private readonly alpha = new Track(0.66);
  private weight = 400;
  private nextAt = -Infinity;
  private lum: number | undefined;

  update(t: number, lum: number | undefined, condensing: boolean): { alpha: number; weight: number; lum: number | undefined } {
    if (lum !== undefined && t >= this.nextAt && !condensing) {
      this.nextAt = t + MOVE.backdropEvery;
      this.lum = lum;
      const tier = tierFor(lum);
      this.alpha.go(t, tier.alpha, MOVE.backdropTween, 'out');
      this.weight = tier.weight;
    }
    return { alpha: this.alpha.at(t), weight: this.weight, lum: this.lum };
  }

  snap(lum: number): void {
    const tier = tierFor(lum);
    this.alpha.set(tier.alpha);
    this.weight = tier.weight;
    this.lum = lum;
  }
}
