import { MM_PER_INCH } from '../config/format';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 'trim' = Fill card (cover, top-anchored); 'margin' = Side margins (contain inside the margin box, centred);
 * 'frame' = Top & side margins (contain inside the frame drawn from the trim line, top-anchored).
 */
export type FitMode = 'trim' | 'margin' | 'frame';

/** The global settings that decide where an auto-fitted picture goes. */
export interface Layout {
  cw: number;
  ch: number;
  fit: FitMode;
  /** Side margins: from the file edge, mm. */
  margin: number;
  /** Bleed per side, mm: how far the trim line sits inside the file edge. */
  bleed: number;
  /** Top & side margins: from the trim line, mm. */
  frame: number;
}

export interface Placement {
  mode: 'auto' | 'manual';
  /** Manual scale, 0.2–3, about the card centre. */
  s: number;
  /** Manual offset from the centred position, mm. */
  dx: number;
  dy: number;
  /**
   * Manual base size, mm: the auto rect frozen at the moment the slot turned manual. A manual slot never follows
   * later changes to the fit mode or margin (spec acceptance #5).
   */
  bw: number;
  bh: number;
}

export interface PictureSize {
  iw: number;
  ih: number;
}

const EPS = 1e-6;

/** The largest size of the picture's shape inside bw × bh. */
function contain(iw: number, ih: number, bw: number, bh: number): { w: number; h: number } {
  let w = bw;
  let h = (w * ih) / iw;
  if (h > bh) {
    h = bh;
    w = (h * iw) / ih;
  }
  return { w, h };
}

export function autoRect(iw: number, ih: number, L: Layout): Rect {
  if (L.fit === 'trim') {
    const k = Math.max(L.cw / iw, L.ch / ih);
    const w = iw * k;
    const h = ih * k;
    // Anchored to the top, so a tall picture loses its bottom (where the signature usually is); a wide one, its sides.
    return { x: (L.cw - w) / 2, y: 0, w, h };
  }
  if (L.fit === 'frame') {
    // The same white from the trim line at the top, left and right. The bottom keeps whatever is left, and never
    // less than that white: a picture too tall for it shrinks, and its sides get wider instead.
    const inset = L.bleed + L.frame;
    const { w, h } = contain(iw, ih, L.cw - 2 * inset, L.ch - 2 * inset);
    return { x: (L.cw - w) / 2, y: inset, w, h };
  }
  const { w, h } = contain(iw, ih, L.cw - 2 * L.margin, L.ch - 2 * L.margin);
  return { x: (L.cw - w) / 2, y: (L.ch - h) / 2, w, h };
}

export function placedRect(pic: PictureSize, p: Placement, L: Layout): Rect {
  if (p.mode === 'auto') return autoRect(pic.iw, pic.ih, L);
  const w = p.bw * p.s;
  const h = p.bh * p.s;
  return { x: (L.cw - w) / 2 + p.dx, y: (L.ch - h) / 2 + p.dy, w, h };
}

/** The first manual interaction converts auto → manual with s = 1 and the offset that keeps the picture still. */
export function toManual(pic: PictureSize, p: Placement, L: Layout): void {
  if (p.mode !== 'auto') return;
  const r = autoRect(pic.iw, pic.ih, L);
  p.mode = 'manual';
  p.s = 1;
  p.bw = r.w;
  p.bh = r.h;
  p.dx = r.x - (L.cw - r.w) / 2;
  p.dy = r.y - (L.ch - r.h) / 2;
}

export function resetToAuto(p: Placement): void {
  p.mode = 'auto';
  p.s = 1;
  p.dx = 0;
  p.dy = 0;
}

/** Effective dpi of the picture at its placed width. */
export const effectiveDpi = (iw: number, placedWidthMm: number): number => iw / (placedWidthMm / MM_PER_INCH);

export type ResolutionLevel = 'ok' | 'warn' | 'bad';

export function resolutionLevel(dpi: number): ResolutionLevel {
  if (dpi >= 300) return 'ok';
  if (dpi >= 200) return 'warn';
  return 'bad';
}

export function isCropped(r: Rect, L: Layout): boolean {
  return r.x < -EPS || r.y < -EPS || r.x + r.w > L.cw + EPS || r.y + r.h > L.ch + EPS;
}
