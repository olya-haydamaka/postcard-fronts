/**
 * Turns a TIFF's samples into sRGB through its embedded profile (see `icc.ts`), fast enough for 40 MP in a worker:
 * - CMYK: the profile is sampled once into a 17⁴ device link, as LittleCMS does for 8-bit CMYK, and each pixel is
 *   interpolated in it the way LittleCMS interpolates (linear in C, tetrahedral over M, Y and K). Unlike LittleCMS,
 *   the link holds linear light, unclipped, and each pixel is clipped and encoded after the interpolation: near a
 *   gamut edge, where a channel nears 0, interpolating encoded values strays by up to 4.7 levels from the profile
 *   (measured on a painting through Apple's Generic CMYK); this way it stays within 1.
 * - RGB: per-channel linearisation tables, one 3 × 3 matrix to linear sRGB, and the same encoding table.
 * The converters write into the RGBA output directly: no per-pixel buffers. Pure: no DOM.
 */
import { clamp01, evalLut, scalePerceptualBlack, srgbEncode, xyzD50ToLinearSrgb, XYZ_TO_SRGB, type Icc } from './icc';

/** How the samples lie in UTIF's decoded data. */
export interface SampleLayout {
  /** Samples per pixel, alpha included. */
  spp: number;
  /** Bytes per sample. 16-bit samples are little-endian (UTIF swaps them), and only the high byte is read. */
  bytes: 1 | 2;
  /** Whether the sample after the colours is alpha (else the output is opaque). */
  alpha: boolean;
}

/** Converts `n` pixels of `data` into `out`, RGBA. */
export type ToSrgb = (data: Uint8Array, n: number, layout: SampleLayout, out: Uint8ClampedArray) => void;

/** Linear 0…1 (in 1/65535 steps) → sRGB byte. 64 KB; an exact table: a coarser one is off by up to 0.8 near black. */
let encodeTable: Uint8Array | null = null;
function srgbBytes(): Uint8Array {
  if (!encodeTable) {
    encodeTable = new Uint8Array(65536);
    for (let i = 0; i < 65536; i++) encodeTable[i] = Math.round(255 * srgbEncode(i / 65535));
  }
  return encodeTable;
}

/** The index of a linear value in `srgbBytes`, clipped to 0…1. */
const linearIndex = (x: number): number => (x > 0 ? (x < 1 ? (x * 65535 + 0.5) | 0 : 65535) : 0);

// ── CMYK ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** LittleCMS's grid for a CMYK device link (`_cmsReasonableGridpointsByColorspace`). */
const G = 17;
/** Link strides, in floats: C slowest (the linear axis), then M, Y, K; three outputs per node. */
const S3 = 3;
const S2 = G * S3;
const S1 = G * S2;
const S0 = G * S1;
const S123 = S1 + S2 + S3;

/** For each 8-bit value: the grid cell below it (0…15) and how far into the cell it lies (0…1; 255 → 15, 1). */
const CELL = new Uint8Array(256);
const FRAC = new Float64Array(256);
for (let v = 0; v < 256; v++) {
  const p = (v * (G - 1)) / 255;
  CELL[v] = Math.min(Math.floor(p), G - 2);
  FRAC[v] = p - CELL[v];
}

/** The profile sampled at every link node, as linear sRGB, unclipped; null if the profile has no usable table. */
function cmykLink(icc: Icc): Float32Array | null {
  const lut = icc.a2b0;
  if (icc.space !== 'CMYK' || !lut) return null;
  const v4 = icc.version >= 4;
  const link = new Float32Array(G ** 4 * 3);
  const dev = new Float64Array(4);
  const xyz = new Float64Array(3);
  const lin = new Float64Array(3);
  for (let c = 0; c < G; c++) {
    for (let m = 0; m < G; m++) {
      for (let y = 0; y < G; y++) {
        for (let k = 0; k < G; k++) {
          dev[0] = c / (G - 1);
          dev[1] = m / (G - 1);
          dev[2] = y / (G - 1);
          dev[3] = k / (G - 1);
          evalLut(lut, dev, xyz);
          if (v4) scalePerceptualBlack(xyz);
          if (!Number.isFinite(xyz[0] + xyz[1] + xyz[2])) return null;
          xyzD50ToLinearSrgb(xyz, lin);
          link.set(lin, c * S0 + m * S1 + y * S2 + k * S3);
        }
      }
    }
  }
  // LittleCMS's white fix-up: no ink is exactly white, unless the table puts it far off (then it stays as it is).
  const far = (x: number) => (255 - 255 * srgbEncode(clamp01(x))) * 257 > 0xf000;
  if (![link[0], link[1], link[2]].some(far)) link.fill(1, 0, 3);
  return link;
}

function cmykPixels(link: Float32Array, data: Uint8Array, n: number, layout: SampleLayout, out: Uint8ClampedArray) {
  const enc = srgbBytes();
  const w = layout.bytes;
  const step = layout.spp * w;
  const alpha = layout.alpha;
  for (let i = 0, s = w - 1, q = 0; i < n; i++, s += step, q += 4) {
    const c = data[s];
    const m = data[s + w];
    const y = data[s + 2 * w];
    const k = data[s + 3 * w];
    const rc = FRAC[c];
    const rx = FRAC[m];
    const ry = FRAC[y];
    const rz = FRAC[k];
    const base = CELL[c] * S0 + CELL[m] * S1 + CELL[y] * S2 + CELL[k] * S3;
    // The tetrahedron's path from the lower corner (LittleCMS's six cases): the first two steps, and the weights.
    let o1 = S3;
    let o2 = S2 + S3;
    let w1 = rz;
    let w2 = ry;
    let w3 = rx;
    if (rx >= ry) {
      if (ry >= rz) {
        o1 = S1;
        o2 = S1 + S2;
        w1 = rx;
        w2 = ry;
        w3 = rz;
      } else if (rx >= rz) {
        o1 = S1;
        o2 = S1 + S3;
        w1 = rx;
        w2 = rz;
        w3 = ry;
      } else {
        o2 = S1 + S3;
        w2 = rx;
        w3 = ry;
      }
    } else if (rx >= rz) {
      o1 = S2;
      o2 = S1 + S2;
      w1 = ry;
      w2 = rx;
      w3 = rz;
    } else if (ry >= rz) {
      o1 = S2;
      w1 = ry;
      w2 = rz;
    }
    for (let ch = 0; ch < 3; ch++) {
      const a = base + ch;
      const b = a + S0;
      const lo = link[a] + w1 * (link[a + o1] - link[a]) + w2 * (link[a + o2] - link[a + o1]) + w3 * (link[a + S123] - link[a + o2]);
      const hi = link[b] + w1 * (link[b + o1] - link[b]) + w2 * (link[b + o2] - link[b + o1]) + w3 * (link[b + S123] - link[b + o2]);
      out[q + ch] = enc[linearIndex(lo + rc * (hi - lo))];
    }
    out[q + 3] = alpha ? data[s + 4 * w] : 255;
  }
}

/** CMYK through the profile's perceptual table; null if the profile has none that can be read. */
export function cmykToSrgb(icc: Icc): ToSrgb | null {
  const link = cmykLink(icc);
  return link ? (data, n, layout, out) => cmykPixels(link, data, n, layout, out) : null;
}

/**
 * UTIF's own formula for CMYK without a usable profile, step for step, so an 8-bit file reads exactly as UTIF reads
 * it. Used for 16-bit files, which UTIF itself misreads (it steps through them as if they were 8-bit).
 */
export const plainCmyk: ToSrgb = (data, n, layout, out) => {
  const w = layout.bytes;
  const step = layout.spp * w;
  for (let i = 0, s = w - 1, q = 0; i < n; i++, s += step, q += 4) {
    const k = (255 - data[s + 3 * w]) * (1 / 255);
    out[q] = ~~((255 - data[s]) * k + 0.5);
    out[q + 1] = ~~((255 - data[s + w]) * k + 0.5);
    out[q + 2] = ~~((255 - data[s + 2 * w]) * k + 0.5);
    out[q + 3] = layout.alpha ? data[s + 4 * w] : 255;
  }
};

// ── RGB ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Row-major 3 × 3 product. */
function mul3(a: ArrayLike<number>, b: ArrayLike<number>): Float64Array {
  const m = new Float64Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) m[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  }
  return m;
}

/**
 * Whether an RGB profile is sRGB in all but rounding: its colourants within 0.005 of sRGB's, and each curve within
 * half a level of sRGB's at every 8-bit code. Such a file is left as it is, byte for byte; converting it would move
 * some bytes by one level (the common HP sRGB profile, measured exactly, is off by up to 0.95 near black).
 */
export function isSrgbLike(icc: Icc): boolean {
  const { matrix, trc } = icc;
  if (!matrix || !trc) return false;
  const m = mul3(XYZ_TO_SRGB, matrix);
  for (let i = 0; i < 9; i++) if (!(Math.abs(m[i] - (i % 4 === 0 ? 1 : 0)) <= 0.005)) return false;
  return trc.every((curve) => {
    for (let v = 0; v < 256; v++) if (!(Math.abs(255 * srgbEncode(clamp01(curve(v / 255))) - v) <= 0.5)) return false;
    return true;
  });
}

function rgbPixels(
  m: Float64Array,
  lin: Float64Array[],
  data: Uint8Array,
  n: number,
  layout: SampleLayout,
  out: Uint8ClampedArray,
) {
  const enc = srgbBytes();
  const [lr, lg, lb] = lin;
  const w = layout.bytes;
  const step = layout.spp * w;
  const alpha = layout.alpha;
  for (let i = 0, s = w - 1, q = 0; i < n; i++, s += step, q += 4) {
    const r = lr[data[s]];
    const g = lg[data[s + w]];
    const b = lb[data[s + 2 * w]];
    for (let ch = 0; ch < 3; ch++) out[q + ch] = enc[linearIndex(m[ch * 3] * r + m[ch * 3 + 1] * g + m[ch * 3 + 2] * b)];
    out[q + 3] = alpha ? data[s + 3 * w] : 255;
  }
}

/** RGB through the profile's colourants and curves; null if it has none, or if it is sRGB already (`isSrgbLike`). */
export function rgbToSrgb(icc: Icc): ToSrgb | null {
  const { matrix, trc } = icc;
  if (icc.space !== 'RGB ' || !matrix || !trc || isSrgbLike(icc)) return null;
  const m = mul3(XYZ_TO_SRGB, matrix);
  const lin = trc.map((curve) => Float64Array.from({ length: 256 }, (_, v) => curve(v / 255)));
  if (![...m, ...lin.flatMap((t) => [...t])].every(Number.isFinite)) return null;
  return (data, n, layout, out) => rgbPixels(m, lin, data, n, layout, out);
}
