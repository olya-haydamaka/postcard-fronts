/** Gap between the front and the back card on stage, px. */
export const CARD_GAP_PX = 28;

export interface StageBox {
  /** Inner size of the scrolling view, px (its padding left out): at 100 % the cards fit inside it. */
  viewWidth: number;
  viewHeight: number;
  /** A card's caption above it ("Front"), with the gap under it, px. */
  captionHeight: number;
  showBack: boolean;
  cardWidthMm: number;
  cardHeightMm: number;
  ghostPadMm: number;
}

/**
 * Stage scale at 100 %, px per mm: the largest at which the front (with its blurred surround) and the back fit the
 * view, clamped to 1.2–6. The prototype estimated the room the caption and the hint leave; the view is measured now,
 * because it scrolls once zoomed in and must not scroll at 100 %.
 */
export function stageScale(b: StageBox): number {
  const n = b.showBack ? 2 : 1;
  const gp = b.ghostPadMm;
  const aw = (b.viewWidth - (n - 1) * CARD_GAP_PX) / (b.cardWidthMm + 2 * gp + (n - 1) * b.cardWidthMm);
  const ah = (b.viewHeight - b.captionHeight) / (b.cardHeightMm + 2 * gp);
  return Math.max(1.2, Math.min(aw, ah, 6));
}

/** View zoom, relative to the fitted stage (1 = 100 % = fit). */
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 4;
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

export const clampZoom = (z: number): number => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));

/** The zoom buttons' next step in or out, from wherever the wheel left the zoom. */
export function stepZoom(z: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOM_STEPS.find((s) => s > z * 1.001) ?? ZOOM_MAX;
  return [...ZOOM_STEPS].reverse().find((s) => s < z / 1.001) ?? ZOOM_MIN;
}

/** Wheel zoom: a mouse wheel's notch (100 px) zooms by about 16 %; a trackpad's small deltas zoom smoothly. */
export const wheelZoomFactor = (deltaY: number): number => Math.exp(-Math.max(-100, Math.min(100, deltaY)) * 0.0015);
