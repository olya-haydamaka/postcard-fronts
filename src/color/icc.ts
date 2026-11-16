/**
 * Reads what a TIFF's embedded ICC profile needs to be shown in sRGB, and nothing more:
 * - a CMYK profile's perceptual table, A2B0, stored as `mft1` (lut8) or `mft2` (lut16), with a Lab or XYZ PCS;
 * - an RGB profile's colourants (`rXYZ`, `gXYZ`, `bXYZ`) and tone curves (`rTRC`, `gTRC`, `bTRC`: `curv` or `para`).
 * A part it can't read is left null; a malformed profile gives null. It never throws on bad bytes: every offset and
 * size is checked before it is read or allocated.
 *
 * The maths follows LittleCMS: the same PCS encodings, the same D50 white, and the same CLUT interpolation (linear
 * in the first input, tetrahedral over the other three), so a picture converts as LittleCMS converts it.
 * Pure: no DOM, unit-tested in Node.
 */

export type Curve = (x: number) => number;

/** How a table's three outputs encode the PCS: 8-bit Lab (`mft1`), 16-bit legacy Lab (`mft2`), or XYZ. */
export type PcsEncoding = 'lab8' | 'lab16' | 'xyz';

/** A device → PCS table with four inputs (CMYK) and three outputs. */
export interface Lut {
  /** Grid points per input. */
  grid: number;
  inCurves: Curve[];
  /** grid⁴ × 3 values, 0…1, the first input varying slowest. */
  clut: Float32Array;
  outCurves: Curve[];
  pcs: PcsEncoding;
}

export interface Icc {
  /** The major version: 2, 4… */
  version: number;
  /** The data colour space, four characters: `CMYK`, `RGB `, `GRAY`… */
  space: string;
  /** A CMYK profile's perceptual table. */
  a2b0: Lut | null;
  /** An RGB profile's linear RGB → XYZ (D50): the colourants as columns, row-major. */
  matrix: Float64Array | null;
  /** An RGB profile's tone curves: device value → linear, each 0…1. */
  trc: [Curve, Curve, Curve] | null;
}

/** The PCS white, D50, as LittleCMS has it. */
export const D50 = [0.9642, 1, 0.8249] as const;

/** XYZ (D50) → linear sRGB: the inverse of sRGB's colourants adapted to D50 (Bradford). */
export const XYZ_TO_SRGB = [
  3.1338561, -1.6168667, -0.4906146, -0.9787684, 1.9161415, 0.033454, 0.0719453, -0.2289914, 1.4052427,
] as const;

/** The black of ICC v4's perceptual reference medium (XYZ), where v4 perceptual tables put full ink. */
const PERCEPTUAL_BLACK = [0.00336, 0.0034731, 0.00287] as const;

/** Clamps to 0…1; NaN gives 0. */
export const clamp01 = (x: number): number => (x > 0 ? (x < 1 ? x : 1) : 0);

export const srgbEncode = (v: number): number => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

const sig = (b: Uint8Array, o: number): string => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

interface Span {
  o: number;
  n: number;
}

interface Reader {
  b: Uint8Array;
  v: DataView;
}

const s15 = (r: Reader, o: number): number => r.v.getInt32(o) / 65536;

function tableCurve(t: Float64Array): Curve {
  const last = t.length - 1;
  return (x) => {
    const p = clamp01(x) * last;
    const i = Math.floor(p);
    return i >= last ? t[last] : t[i] + (p - i) * (t[i + 1] - t[i]);
  };
}

/** x^g for x > 0, else 0: never NaN. */
const pw = (x: number, g: number): number => (x > 0 ? Math.pow(x, g) : 0);

/** ICC parametric curves, types 0–4 (ICC.1:2010 10.18). */
function paraCurve(type: number, p: number[]): Curve | null {
  const [g, a, b, c, d, e, f] = p;
  switch (type) {
    case 0:
      return (x) => clamp01(pw(clamp01(x), g));
    case 1:
      return (x) => {
        const t = a * clamp01(x) + b;
        return clamp01(t >= 0 ? pw(t, g) : 0);
      };
    case 2:
      return (x) => {
        const t = a * clamp01(x) + b;
        return clamp01(t >= 0 ? pw(t, g) + c : c);
      };
    case 3:
      return (x) => {
        const u = clamp01(x);
        return clamp01(u >= d ? pw(a * u + b, g) : c * u);
      };
    case 4:
      return (x) => {
        const u = clamp01(x);
        return clamp01(u >= d ? pw(a * u + b, g) + e : c * u + f);
      };
    default:
      return null;
  }
}

const PARA_PARAMS = [1, 3, 4, 5, 7];

function readCurve(r: Reader, t: Span | undefined): Curve | null {
  if (!t || t.n < 12) return null;
  const type = sig(r.b, t.o);
  if (type === 'curv') {
    const count = r.v.getUint32(t.o + 8);
    if (12 + count * 2 > t.n) return null;
    if (count === 0) return clamp01;
    if (count === 1) {
      const g = r.v.getUint16(t.o + 12) / 256;
      return (x) => pw(clamp01(x), g);
    }
    const table = new Float64Array(count);
    for (let i = 0; i < count; i++) table[i] = r.v.getUint16(t.o + 12 + i * 2) / 65535;
    return tableCurve(table);
  }
  if (type === 'para') {
    const fn = r.v.getUint16(t.o + 8);
    const np = PARA_PARAMS[fn];
    if (np === undefined || 12 + np * 4 > t.n) return null;
    const p: number[] = [];
    for (let i = 0; i < np; i++) p.push(s15(r, t.o + 12 + i * 4));
    return paraCurve(fn, p);
  }
  return null;
}

function readXyz(r: Reader, t: Span | undefined): [number, number, number] | null {
  if (!t || t.n < 20 || sig(r.b, t.o) !== 'XYZ ') return null;
  return [s15(r, t.o + 8), s15(r, t.o + 12), s15(r, t.o + 16)];
}

/** An `mft1` or `mft2` table with four inputs and three outputs. Its matrix applies to XYZ input only: ignored. */
function readLut(r: Reader, t: Span | undefined, pcs: string): Lut | null {
  if (!t || t.n < 52) return null;
  const type = sig(r.b, t.o);
  if (type !== 'mft1' && type !== 'mft2') return null;
  const wide = type === 'mft2';
  const encoding: PcsEncoding | null = pcs === 'XYZ ' ? 'xyz' : pcs === 'Lab ' ? (wide ? 'lab16' : 'lab8') : null;
  const grid = r.b[t.o + 10];
  if (!encoding || r.b[t.o + 8] !== 4 || r.b[t.o + 9] !== 3 || grid < 2) return null;
  const nIn = wide ? r.v.getUint16(t.o + 48) : 256;
  const nOut = wide ? r.v.getUint16(t.o + 50) : 256;
  if (nIn < 2 || nIn > 4096 || nOut < 2 || nOut > 4096) return null;
  const cells = grid ** 4 * 3;
  const unit = wide ? 2 : 1;
  const head = wide ? 52 : 48;
  // The declared size, checked before anything is allocated: a grid of 255 declares 12.7 G cells.
  if (head + (4 * nIn + cells + 3 * nOut) * unit > t.n) return null;
  const max = wide ? 65535 : 255;
  let o = t.o + head;
  const next = (): number => {
    const x = (wide ? r.v.getUint16(o) : r.b[o]) / max;
    o += unit;
    return x;
  };
  const table = (n: number): Curve => {
    const a = new Float64Array(n);
    for (let i = 0; i < n; i++) a[i] = next();
    return tableCurve(a);
  };
  const inCurves = [table(nIn), table(nIn), table(nIn), table(nIn)];
  const clut = new Float32Array(cells);
  for (let i = 0; i < cells; i++) clut[i] = next();
  const outCurves = [table(nOut), table(nOut), table(nOut)];
  return { grid, inCurves, clut, outCurves, pcs: encoding };
}

/** The profile's readable parts, or null when its header or tag table is malformed. */
export function parseIcc(bytes: Uint8Array): Icc | null {
  if (bytes.length < 132) return null;
  const r: Reader = { b: bytes, v: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength) };
  const size = r.v.getUint32(0);
  if (size < 132 || size > bytes.length || sig(bytes, 36) !== 'acsp') return null;
  const count = r.v.getUint32(128);
  if (132 + count * 12 > size) return null;
  const tags = new Map<string, Span>();
  for (let i = 0; i < count; i++) {
    const e = 132 + i * 12;
    const o = r.v.getUint32(e + 4);
    const n = r.v.getUint32(e + 8);
    if (o + n > size) return null;
    const s = sig(bytes, e);
    if (!tags.has(s)) tags.set(s, { o, n });
  }
  const space = sig(bytes, 16);
  const icc: Icc = { version: bytes[8], space, a2b0: null, matrix: null, trc: null };
  if (space === 'CMYK') icc.a2b0 = readLut(r, tags.get('A2B0'), sig(bytes, 20));
  if (space === 'RGB ') {
    const [rc, gc, bc] = ['rXYZ', 'gXYZ', 'bXYZ'].map((s) => readXyz(r, tags.get(s)));
    const [rt, gt, bt] = ['rTRC', 'gTRC', 'bTRC'].map((s) => readCurve(r, tags.get(s)));
    if (rc && gc && bc && rt && gt && bt) {
      icc.matrix = Float64Array.of(rc[0], gc[0], bc[0], rc[1], gc[1], bc[1], rc[2], gc[2], bc[2]);
      icc.trc = [rt, gt, bt];
    }
  }
  return icc;
}

/**
 * One output of a tetrahedral interpolation (LittleCMS's case order) over a 3-D grid at `b`: X0/X1… are the lower
 * and upper offsets along each axis (equal at 1.0, so nothing past the grid is read), rx… how far between them.
 */
function tetra(
  t: Float32Array,
  b: number,
  X0: number,
  X1: number,
  Y0: number,
  Y1: number,
  Z0: number,
  Z1: number,
  rx: number,
  ry: number,
  rz: number,
): number {
  const c0 = t[b + X0 + Y0 + Z0];
  if (rx >= ry && ry >= rz)
    return (
      c0 +
      (t[b + X1 + Y0 + Z0] - c0) * rx +
      (t[b + X1 + Y1 + Z0] - t[b + X1 + Y0 + Z0]) * ry +
      (t[b + X1 + Y1 + Z1] - t[b + X1 + Y1 + Z0]) * rz
    );
  if (rx >= rz && rz >= ry)
    return (
      c0 +
      (t[b + X1 + Y0 + Z0] - c0) * rx +
      (t[b + X1 + Y1 + Z1] - t[b + X1 + Y0 + Z1]) * ry +
      (t[b + X1 + Y0 + Z1] - t[b + X1 + Y0 + Z0]) * rz
    );
  if (rz >= rx && rx >= ry)
    return (
      c0 +
      (t[b + X1 + Y0 + Z1] - t[b + X0 + Y0 + Z1]) * rx +
      (t[b + X1 + Y1 + Z1] - t[b + X1 + Y0 + Z1]) * ry +
      (t[b + X0 + Y0 + Z1] - c0) * rz
    );
  if (ry >= rx && rx >= rz)
    return (
      c0 +
      (t[b + X1 + Y1 + Z0] - t[b + X0 + Y1 + Z0]) * rx +
      (t[b + X0 + Y1 + Z0] - c0) * ry +
      (t[b + X1 + Y1 + Z1] - t[b + X1 + Y1 + Z0]) * rz
    );
  if (ry >= rz && rz >= rx)
    return (
      c0 +
      (t[b + X1 + Y1 + Z1] - t[b + X0 + Y1 + Z1]) * rx +
      (t[b + X0 + Y1 + Z0] - c0) * ry +
      (t[b + X0 + Y1 + Z1] - t[b + X0 + Y1 + Z0]) * rz
    );
  if (rz >= ry && ry >= rx)
    return (
      c0 +
      (t[b + X1 + Y1 + Z1] - t[b + X0 + Y1 + Z1]) * rx +
      (t[b + X0 + Y1 + Z1] - t[b + X0 + Y0 + Z1]) * ry +
      (t[b + X0 + Y0 + Z1] - c0) * rz
    );
  return c0;
}

/**
 * A 4-input, 3-output CLUT at `x` (each 0…1), as LittleCMS's `Eval4Inputs`: linear along the first input between
 * two tetrahedral interpolations over the other three.
 */
function interp4(t: Float32Array, grid: number, x: ArrayLike<number>, out: Float64Array): void {
  const d = grid - 1;
  const s3 = 3;
  const s2 = grid * s3;
  const s1 = grid * s2;
  const s0 = grid * s1;
  const axis = (v: number, s: number): [number, number, number] => {
    const p = v * d;
    const i = Math.floor(p);
    return v >= 1 ? [d * s, d * s, 0] : [i * s, (i + 1) * s, p - i];
  };
  const [K0, K1, rk] = axis(x[0], s0);
  const [X0, X1, rx] = axis(x[1], s1);
  const [Y0, Y1, ry] = axis(x[2], s2);
  const [Z0, Z1, rz] = axis(x[3], s3);
  for (let c = 0; c < 3; c++) {
    const lo = tetra(t, K0 + c, X0, X1, Y0, Y1, Z0, Z1, rx, ry, rz);
    const hi = tetra(t, K1 + c, X0, X1, Y0, Y1, Z0, Z1, rx, ry, rz);
    out[c] = lo + (hi - lo) * rk;
  }
}

const finv = (t: number): number => (t > 6 / 29 ? t * t * t : (108 / 841) * (t - 4 / 29));

/** CIE Lab (D50) → XYZ (D50). */
export function labToXyz(L: number, a: number, b: number, xyz: Float64Array): void {
  const fy = (L + 16) / 116;
  xyz[0] = D50[0] * finv(fy + a / 500);
  xyz[1] = D50[1] * finv(fy);
  xyz[2] = D50[2] * finv(fy - b / 200);
}

function pcsToXyz(enc: PcsEncoding, p: number, q: number, s: number, xyz: Float64Array): void {
  if (enc === 'xyz') {
    const k = 65535 / 32768;
    xyz[0] = p * k;
    xyz[1] = q * k;
    xyz[2] = s * k;
    return;
  }
  // 8-bit Lab: L 0…255 ↔ 0…100. Legacy 16-bit Lab: L 0…0xFF00 ↔ 0…100, a/b 0x8000 ↔ 0.
  const L = enc === 'lab8' ? p * 100 : (p * 100 * 65535) / 65280;
  const k = enc === 'lab8' ? 255 : 65535 / 256;
  labToXyz(L, q * k - 128, s * k - 128, xyz);
}

const lutIn = new Float64Array(4);
const lutOut = new Float64Array(3);

/** CMYK device values (each 0…1) through the table to XYZ (D50). */
export function evalLut(lut: Lut, input: ArrayLike<number>, xyz: Float64Array): void {
  for (let c = 0; c < 4; c++) lutIn[c] = clamp01(lut.inCurves[c](clamp01(input[c])));
  interp4(lut.clut, lut.grid, lutIn, lutOut);
  const [o0, o1, o2] = lut.outCurves;
  pcsToXyz(lut.pcs, o0(clamp01(lutOut[0])), o1(clamp01(lutOut[1])), o2(clamp01(lutOut[2])), xyz);
}

/**
 * ICC v4 perceptual tables put full ink at the reference medium's black; this maps that black to 0, as LittleCMS
 * does (it forces black point compensation for v4 perceptual conversions).
 */
export function scalePerceptualBlack(xyz: Float64Array): void {
  for (let i = 0; i < 3; i++) xyz[i] = (D50[i] * (xyz[i] - PERCEPTUAL_BLACK[i])) / (D50[i] - PERCEPTUAL_BLACK[i]);
}

/** XYZ (D50) → linear sRGB, not clipped: outside sRGB, a channel is below 0 or above 1. */
export function xyzD50ToLinearSrgb(xyz: ArrayLike<number>, out: Float64Array): void {
  const m = XYZ_TO_SRGB;
  for (let i = 0; i < 3; i++) out[i] = m[i * 3] * xyz[0] + m[i * 3 + 1] * xyz[1] + m[i * 3 + 2] * xyz[2];
}

/** XYZ (D50) → sRGB, 0…255 (not rounded): out-of-gamut colours are clipped. */
export function xyzD50ToSrgb255(xyz: ArrayLike<number>, out: Float64Array): void {
  xyzD50ToLinearSrgb(xyz, out);
  for (let i = 0; i < 3; i++) out[i] = 255 * srgbEncode(clamp01(out[i]));
}
