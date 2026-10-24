import type { CardFormat } from '../config/format';
import type { Overlays, SnapGuide } from '../state/store';
import { CASING, casingRuns, type RGB, type RGBA } from './contrast';

export interface OverlayInput {
  bleed: number;
  margin: number;
  ov: Overlays;
  /** Active snap guide; pass null on the back preview. */
  snap: SnapGuide | null;
  /**
   * What the card shows at a point, mm. Where a guide line would disappear into it, the line gets a light or dark
   * casing underneath. Leave it out for white paper (the back), where every line shows as designed.
   */
  backdrop?: (x: number, y: number) => RGB;
}

const TRIM: RGBA = [178, 70, 58, 1];
const SAFE: RGBA = [91, 78, 62, 0.55];
const MARGIN: RGBA = [138, 120, 98, 0.5];
const SNAP: RGBA = [181, 83, 58, 1];
const css = ([r, g, b, a]: RGBA): string => `rgba(${r},${g},${b},${a})`;

/** One straight guide line, mm. `off` shifts it by CSS px, as the line itself is drawn (crisp 1 px strokes). */
interface Guide {
  vertical: boolean;
  at: number;
  from: number;
  to: number;
  off: number;
  color: RGBA;
  width: number;
}

/** Along a line, the backdrop is read every 0.5 mm, at three points across it (the casing's width at stage scale). */
const STEP_MM = 0.5;
const ACROSS_MM = [-0.4, 0, 0.4];

function rectGuides(x0: number, y0: number, x1: number, y1: number, off: number, color: RGBA): Guide[] {
  const line = { off, color, width: 1 };
  return [
    { vertical: false, at: y0, from: x0, to: x1, ...line },
    { vertical: false, at: y1, from: x0, to: x1, ...line, off: -off },
    { vertical: true, at: x0, from: y0, to: y1, ...line },
    { vertical: true, at: x1, from: y0, to: y1, ...line, off: -off },
  ];
}

/** The lines drawOverlays draws, as straight segments: where their casings go. */
function guideLines(f: CardFormat, o: OverlayInput): Guide[] {
  const W = f.widthMm;
  const H = f.heightMm;
  const b = o.bleed;
  const out: Guide[] = [];
  if (o.ov.trim) out.push(...rectGuides(b, b, W - b, H - b, 0.5, TRIM));
  if (o.ov.safe) {
    const s = b + f.safeMm;
    out.push(...rectGuides(s, s, W - s, H - s, 0, SAFE));
    for (const x of [o.margin, W - o.margin]) {
      out.push({ vertical: true, at: x, from: 0, to: H, off: 0, color: MARGIN, width: 1 });
    }
  }
  if (o.snap?.x != null) out.push({ vertical: true, at: o.snap.x, from: 0, to: H, off: 0, color: SNAP, width: 1.5 });
  if (o.snap?.y != null) out.push({ vertical: false, at: o.snap.y, from: 0, to: W, off: 0, color: SNAP, width: 1.5 });
  return out;
}

/** Casings under the lines that would disappear into the picture, 1 px wider than the line on each side. */
function drawCasings(
  c: CanvasRenderingContext2D,
  k: number,
  guides: Guide[],
  backdrop: (x: number, y: number) => RGB,
): void {
  c.setLineDash([]);
  for (const g of guides) {
    const n = Math.max(1, Math.round((g.to - g.from) / STEP_MM));
    const step = (g.to - g.from) / n;
    const samples: RGB[][] = [];
    for (let i = 0; i < n; i++) {
      const t = g.from + (i + 0.5) * step;
      samples.push(ACROSS_MM.map((d) => (g.vertical ? backdrop(g.at + d, t) : backdrop(t, g.at + d))));
    }
    for (const run of casingRuns(samples, g.color)) {
      const a = g.at * k + g.off;
      const p0 = (g.from + run.from * step) * k;
      const p1 = (g.from + run.to * step) * k;
      c.strokeStyle = css(CASING[run.tone]);
      c.lineWidth = g.width + 2;
      c.beginPath();
      if (g.vertical) {
        c.moveTo(a, p0);
        c.lineTo(a, p1);
      } else {
        c.moveTo(p0, a);
        c.lineTo(p1, a);
      }
      c.stroke();
    }
  }
}

/**
 * Preview-only guides: bleed tint, trim line, safe zone + side-margin lines, and the active snap guide. Over a
 * picture, a line that would disappear gets a casing underneath (see `backdrop`).
 */
export function drawOverlays(c: CanvasRenderingContext2D, k: number, f: CardFormat, o: OverlayInput): void {
  const W = f.widthMm;
  const H = f.heightMm;
  const b = o.bleed;
  c.save();
  if (o.ov.bleed && b > 0) {
    c.fillStyle = 'rgba(181,83,58,.13)';
    c.beginPath();
    c.rect(0, 0, W * k, H * k);
    c.rect(b * k, b * k, (W - 2 * b) * k, (H - 2 * b) * k);
    c.fill('evenodd');
  }
  if (o.backdrop) drawCasings(c, k, guideLines(f, o), o.backdrop);
  c.lineWidth = 1;
  if (o.ov.trim) {
    c.strokeStyle = css(TRIM);
    c.setLineDash([6, 4]);
    c.strokeRect(b * k + 0.5, b * k + 0.5, (W - 2 * b) * k - 1, (H - 2 * b) * k - 1);
  }
  if (o.ov.safe) {
    const s = b + f.safeMm;
    c.strokeStyle = css(SAFE);
    c.setLineDash([2, 3]);
    c.strokeRect(s * k, s * k, (W - 2 * s) * k, (H - 2 * s) * k);
    const m = o.margin;
    c.strokeStyle = css(MARGIN);
    c.setLineDash([]);
    c.beginPath();
    c.moveTo(m * k, 0);
    c.lineTo(m * k, H * k);
    c.moveTo((W - m) * k, 0);
    c.lineTo((W - m) * k, H * k);
    c.stroke();
  }
  if (o.snap) {
    c.strokeStyle = css(SNAP);
    c.setLineDash([]);
    c.lineWidth = 1.5;
    c.beginPath();
    if (o.snap.x != null) {
      c.moveTo(o.snap.x * k, 0);
      c.lineTo(o.snap.x * k, H * k);
    }
    if (o.snap.y != null) {
      c.moveTo(0, o.snap.y * k);
      c.lineTo(W * k, o.snap.y * k);
    }
    c.stroke();
  }
  c.restore();
}
