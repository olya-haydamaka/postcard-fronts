import type { Rect } from '../geometry/fit';

/** A colour, channels 0–255. A line colour adds its opacity, 0–1. */
export type RGB = readonly [number, number, number];
export type RGBA = readonly [number, number, number, number];

export const WHITE: RGB = [255, 255, 255];

const LINEAR = Array.from({ length: 256 }, (_, v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
const lin = (v: number): number => LINEAR[Math.max(0, Math.min(255, Math.round(v)))];

/** WCAG relative luminance. */
export const luminance = ([r, g, b]: RGB): number => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

/** WCAG contrast ratio, 1–21. */
export function contrast(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** What a translucent colour looks like over an opaque one (blended in sRGB, as a canvas does). */
export const over = ([r, g, b, a]: RGBA, [R, G, B]: RGB): RGB => [
  r * a + R * (1 - a),
  g * a + G * (1 - a),
  b * a + B * (1 - a),
];

/** The two casings a guide line can get underneath it: light over dark or mid colours, dark over light ones. */
export const CASING = {
  light: [255, 255, 255, 0.9],
  dark: [43, 36, 29, 0.75],
} as const satisfies Record<string, RGBA>;
export type Tone = keyof typeof CASING;

/**
 * The contrast a line needs over the picture before it can go without a casing: as much as the design gives it on
 * white paper, and never more than WCAG's 3:1 for graphics. A faint margin line stays faint; it just never vanishes.
 */
export const needed = (line: RGBA): number => Math.min(3, 0.9 * contrast(over(line, WHITE), WHITE));

/** The casing tone that stands out both from the backdrop and behind the line drawn on it. */
export function toneFor(line: RGBA, bg: RGB): Tone {
  const score = (t: Tone): number => {
    const seen = over(CASING[t], bg);
    return Math.min(contrast(seen, bg), contrast(over(line, seen), seen));
  };
  return score('light') >= score('dark') ? 'light' : 'dark';
}

export interface Run {
  /** First step, inclusive. */
  from: number;
  /** Last step, exclusive. */
  to: number;
  tone: Tone;
}

/**
 * Where a guide line needs a casing, and which one. `samples[i]` are the backdrop colours at step i along the line
 * (a few across it). Steps are judged `perSeg` at a time: a segment needs a casing when at least half of its colours
 * hide the line. One-segment gaps between such segments are bridged, so a busy picture doesn't chop the casing up.
 * Each run takes the tone that suits the colours that hid the line in it.
 */
export function casingRuns(samples: readonly (readonly RGB[])[], line: RGBA, perSeg = 4): Run[] {
  const need = needed(line);
  const nSeg = Math.ceil(samples.length / perSeg);
  const hidden: boolean[] = [];
  // Per segment: the summed colour and count of the backdrop colours that hide the line.
  const hiding: [number, number, number, number][] = [];
  for (let s = 0; s < nSeg; s++) {
    const sum: [number, number, number, number] = [0, 0, 0, 0];
    let total = 0;
    for (let i = s * perSeg; i < Math.min(samples.length, (s + 1) * perSeg); i++) {
      for (const bg of samples[i]) {
        total++;
        if (contrast(over(line, bg), bg) >= need) continue;
        sum[0] += bg[0];
        sum[1] += bg[1];
        sum[2] += bg[2];
        sum[3]++;
      }
    }
    hidden.push(total > 0 && sum[3] * 2 >= total);
    hiding.push(sum);
  }
  for (let s = 1; s < nSeg - 1; s++) if (!hidden[s] && hidden[s - 1] && hidden[s + 1]) hidden[s] = true;

  const runs: Run[] = [];
  for (let s = 0; s < nSeg; ) {
    if (!hidden[s]) {
      s++;
      continue;
    }
    const acc = [0, 0, 0, 0];
    let e = s;
    for (; e < nSeg && hidden[e]; e++) for (let c = 0; c < 4; c++) acc[c] += hiding[e][c];
    const bg: RGB = [acc[0] / acc[3], acc[1] / acc[3], acc[2] / acc[3]];
    runs.push({ from: s * perSeg, to: Math.min(samples.length, e * perSeg), tone: toneFor(line, bg) });
    s = e;
  }
  return runs;
}

/** Pixels of a downscaled copy of the picture, as `ImageData` holds them. */
export interface Pixels {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

/**
 * What the card shows at a point (mm): the picture where it is placed (over white, as the card draws it), white paper
 * everywhere else.
 */
export function backdropAt(p: Pixels, r: Rect, x: number, y: number): RGB {
  const u = (x - r.x) / r.w;
  const v = (y - r.y) / r.h;
  if (!(u >= 0 && u < 1 && v >= 0 && v < 1)) return WHITE;
  const i = (Math.floor(v * p.height) * p.width + Math.floor(u * p.width)) * 4;
  const a = p.data[i + 3] / 255;
  return over([p.data[i], p.data[i + 1], p.data[i + 2], a], WHITE);
}
