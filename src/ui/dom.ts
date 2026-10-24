export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} is missing from the page`);
  return el as T;
}

/**
 * Device pixels per CSS pixel for a canvas of w × h CSS px: the screen's, unless the canvas would then hold more than
 * `budget` pixels. A card zoomed to 400 % on a high-dpi screen would otherwise take hundreds of MB; the preview
 * picture (≤ 2400 px) has no more detail to show anyway.
 */
export function canvasRatio(w: number, h: number, budget = 8e6): number {
  const r = devicePixelRatio || 1;
  return Math.min(r, Math.sqrt(budget / Math.max(1, w * h)));
}

/** Sizes a canvas to wMm × hMm at `k` px per mm, sharp on high-dpi screens; returns a context in CSS pixels. */
export function sizeCanvas(cv: HTMLCanvasElement, wMm: number, hMm: number, k: number): CanvasRenderingContext2D {
  const r = canvasRatio(wMm * k, hMm * k);
  cv.width = Math.round(wMm * k * r);
  cv.height = Math.round(hMm * k * r);
  cv.style.width = `${wMm * k}px`;
  cv.style.height = `${hMm * k}px`;
  const c = cv.getContext('2d');
  if (!c) throw new Error('2D canvas unavailable');
  c.setTransform(r, 0, 0, r, 0, 0);
  return c;
}

export const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
