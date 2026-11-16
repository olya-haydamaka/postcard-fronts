import UTIF, { type IFD } from 'utif';
import { parseIcc } from '../color/icc';
import { cmykToSrgb, plainCmyk, rgbToSrgb, type SampleLayout, type ToSrgb } from '../color/to-srgb';

const area = (d: IFD): number => (d.t256?.[0] ?? d.width ?? 0) * (d.t257?.[0] ?? d.height ?? 0);

const first = (tag: unknown): number | undefined => (Array.isArray(tag) ? (tag[0] as number) : undefined);

/** The image with the most pixels: a TIFF may carry a thumbnail first. */
export function largestIfd(ifds: IFD[]): IFD {
  let p = ifds[0];
  for (const d of ifds) if (area(d) > area(p)) p = d;
  return p;
}

/**
 * How the decoded samples lie, for the layouts the colour conversion handles: CMYK (Photometric 5, four inks) or
 * RGB (Photometric 2), interleaved, 8 or 16 bits, unsigned integers, with at most one extra sample (alpha).
 * Anything else is null and decodes as before.
 */
function sampleLayout(p: IFD, w: number, h: number): (SampleLayout & { colours: 3 | 4 }) | null {
  const photometric = first(p.t262);
  const colours = photometric === 5 ? 4 : photometric === 2 ? 3 : 0;
  const spp = first(p.t277);
  const bits = p.t258 as number[] | undefined;
  if (!colours || !spp || !Array.isArray(bits) || bits.length !== spp) return null;
  if (spp !== colours && spp !== colours + 1) return null;
  if ((bits[0] !== 8 && bits[0] !== 16) || bits.some((b) => b !== bits[0])) return null;
  const format = p.t339;
  if (Array.isArray(format) && format.some((f) => f !== 1)) return null;
  const planar = first(p.t284);
  if (planar !== undefined && planar !== 1) return null;
  const extra = p.t338;
  if ((Array.isArray(extra) ? extra.length : 0) !== spp - colours) return null;
  if (photometric === 5) {
    const inkSet = first(p.t332);
    const inks = first(p.t334);
    if ((inkSet !== undefined && inkSet !== 1) || (inks !== undefined && inks !== 4)) return null;
  }
  const bytes = bits[0] === 16 ? 2 : 1;
  // Fewer strips than the height needs leave the data short: then UTIF reads it as it always has.
  if (!(p.data instanceof Uint8Array) || p.data.length < w * h * spp * bytes) return null;
  return { colours, spp, bytes, alpha: spp > colours };
}

/** The converter for the file's embedded profile, if there is one that applies. */
function profileConverter(p: IFD, colours: 3 | 4): ToSrgb | null {
  const bytes = p.t34675;
  if (!(bytes instanceof Uint8Array)) return null;
  try {
    const icc = parseIcc(bytes);
    if (!icc) return null;
    return colours === 4 ? cmykToSrgb(icc) : rgbToSrgb(icc);
  } catch {
    // A profile is untrusted input: whatever it does, the picture still decodes as before.
    return null;
  }
}

/**
 * RGBA through the embedded colour profile, or null when there is none to apply: untagged files, sRGB profiles,
 * and the layouts and profiles the conversion doesn't handle, which then read exactly as UTIF reads them.
 */
function profiledRgba(p: IFD, w: number, h: number): Uint8ClampedArray<ArrayBuffer> | null {
  const layout = sampleLayout(p, w, h);
  if (!layout || !p.data) return null;
  // UTIF steps through 16-bit CMYK as if it were 8-bit; its formula on the high bytes is the honest fallback.
  const convert = profileConverter(p, layout.colours) ?? (layout.colours === 4 && layout.bytes === 2 ? plainCmyk : null);
  if (!convert) return null;
  const rgba = new Uint8ClampedArray(w * h * 4);
  convert(p.data, w * h, layout, rgba);
  return rgba;
}

/**
 * Decodes the largest image of a TIFF into RGBA. An embedded CMYK or RGB profile is applied (see `src/color/`), the
 * way browsers apply one in a JPEG; everything else is UTIF's own conversion, unchanged.
 */
export function tiffPixels(buf: ArrayBuffer): { rgba: Uint8ClampedArray<ArrayBuffer>; w: number; h: number } {
  const ifds = UTIF.decode(buf);
  if (!ifds.length) throw new Error('no image in TIFF');
  const p = largestIfd(ifds);
  UTIF.decodeImage(buf, p, ifds);
  // Read after decodeImage, which may rewrite tags (JPEG-in-TIFF becomes RGB).
  const w = p.width ?? 0;
  const h = p.height ?? 0;
  if (!w || !h) throw new Error('TIFF without size');
  const profiled = profiledRgba(p, w, h);
  if (profiled) return { rgba: profiled, w, h };
  const rgba = UTIF.toRGBA8(p);
  return { rgba: new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, w * h * 4), w, h };
}
