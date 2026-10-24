import type { CardFormat } from '../config/format';
import type { BackText } from '../config/preset';

/** Back design "option G": name, «title», website. Same in every UI language. */
export const BACK_FONT = '"Cormorant Garamond"';

const supportsLetterSpacing =
  typeof CanvasRenderingContext2D !== 'undefined' && 'letterSpacing' in CanvasRenderingContext2D.prototype;

function fillTextSpaced(c: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number): void {
  if (supportsLetterSpacing) {
    c.letterSpacing = `${spacing}px`;
    c.fillText(text, x, y);
    c.letterSpacing = '0px';
    return;
  }
  // Older WebKit: place glyphs one by one (loses kerning, keeps the tracking).
  let cx = x;
  for (const ch of text) {
    c.fillText(ch, cx, y);
    cx += c.measureText(ch).width + spacing;
  }
}

/**
 * `k` = px per mm. Text sits 10 mm from the left and top edges; the website 10 mm from the bottom.
 * An empty name or website is left off; the title keeps its place either way.
 */
export function drawBackG(c: CanvasRenderingContext2D, title: string, k: number, back: BackText, f: CardFormat): void {
  const M = 10 * k;
  const FS = 3.25 * k;
  const LS = 3 * k;
  c.fillStyle = '#fff';
  c.fillRect(0, 0, f.widthMm * k, f.heightMm * k);

  c.font = `500 ${FS}px ${BACK_FONT}`;
  c.fillStyle = '#5B4E3E';
  const base = M + c.measureText(back.artist || 'H').actualBoundingBoxAscent;
  if (back.artist) fillTextSpaced(c, back.artist, M, base, 0.08 * FS);

  c.font = `italic 400 ${FS}px ${BACK_FONT}`;
  c.fillStyle = '#8A7862';
  c.fillText(`«${title}»`, M, base + 4.75 * k);

  if (!back.website) return;
  c.font = `italic 400 ${LS}px ${BACK_FONT}`;
  c.fillStyle = '#B5533A';
  c.fillText(back.website, M, f.heightMm * k - M - c.measureText(back.website).actualBoundingBoxDescent);
}

/** Loads the glyphs the back needs (a title or name may use characters from a subset not loaded yet). */
export async function loadBackFonts(title: string, back: BackText): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load(`500 40px ${BACK_FONT}`, back.artist || 'H'),
      document.fonts.load(`italic 400 40px ${BACK_FONT}`, `«${title}» ${back.website}`),
    ]);
  } catch {
    // A font failure must not block export; the browser falls back.
  }
}
