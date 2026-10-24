import type { CardFormat } from '../config/format';
import type { Rect } from '../geometry/fit';

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** White card, then the picture clipped to the card. `k` = px per mm. Used for the stage, thumbnails and export. */
export function drawFront(c: Ctx2D, img: CanvasImageSource | null, r: Rect | null, k: number, f: CardFormat): void {
  c.fillStyle = '#fff';
  c.fillRect(0, 0, f.widthMm * k, f.heightMm * k);
  if (!img || !r) return;
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(img, r.x * k, r.y * k, r.w * k, r.h * k);
}

/** Feature-detected on the prototype: assigning to an unsupported property would just create an expando. */
const supportsCanvasFilter =
  typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;

/**
 * The "cropped preview" behind the card: the whole picture rect, blurred (~0.9 mm, at least 2 px) at 42 % opacity,
 * plus a dashed outline of its bounds. The caller has translated `c` to the card origin.
 */
export function drawGhostPicture(c: CanvasRenderingContext2D, img: CanvasImageSource, r: Rect, k: number): void {
  const blur = Math.max(2, k * 0.9);
  c.save();
  c.globalAlpha = 0.42;
  if (supportsCanvasFilter) {
    c.filter = `blur(${blur}px)`;
    c.drawImage(img, r.x * k, r.y * k, r.w * k, r.h * k);
  } else {
    // WebKit: no canvas filters. Downscale by the blur radius and scale back up for a similar softness.
    const w = Math.max(1, Math.round((r.w * k) / blur));
    const h = Math.max(1, Math.round((r.h * k) / blur));
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    const t = tmp.getContext('2d');
    if (t) {
      t.imageSmoothingQuality = 'high';
      t.drawImage(img, 0, 0, w, h);
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
      c.drawImage(tmp, r.x * k, r.y * k, r.w * k, r.h * k);
    }
  }
  c.restore();
  c.strokeStyle = 'rgba(91,78,62,.6)';
  c.setLineDash([3, 3]);
  c.lineWidth = 1;
  c.strokeRect(r.x * k + 0.5, r.y * k + 0.5, r.w * k - 1, r.h * k - 1);
}
