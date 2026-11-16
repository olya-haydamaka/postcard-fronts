/**
 * Synthetic ICC profiles for the tests. No real profile is committed: those that come with systems and applications
 * are copyrighted. These are built from published numbers (primaries, white points, the sRGB and Adobe RGB curves)
 * or from a made-up press with a known answer.
 */
import { D50, srgbEncode } from '../src/color/icc';

export type Triple = [number, number, number];
type Xy = [number, number];

// ── Writing a profile ─────────────────────────────────────────────────────────────────────────────────────────────

const ascii = (b: Uint8Array, o: number, s: string) => {
  for (let i = 0; i < 4; i++) b[o + i] = s.charCodeAt(i);
};
const s15 = (x: number) => Math.round(x * 65536);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export interface ProfileSpec {
  space: 'CMYK' | 'RGB ' | 'GRAY';
  pcs?: 'Lab ' | 'XYZ ';
  version?: number;
}

/** A profile: the 128-byte header, the tag table, then each tag's data, 4-byte aligned. */
export function iccProfile(spec: ProfileSpec, tags: [string, Uint8Array][]): Uint8Array {
  let size = 132 + tags.length * 12;
  const at: number[] = [];
  for (const [, d] of tags) {
    size += (4 - (size % 4)) % 4;
    at.push(size);
    size += d.length;
  }
  const b = new Uint8Array(size);
  const v = new DataView(b.buffer);
  v.setUint32(0, size);
  ascii(b, 4, 'test');
  b[8] = spec.version ?? 2;
  b[9] = 0x20;
  ascii(b, 12, spec.space === 'CMYK' ? 'prtr' : 'mntr');
  ascii(b, 16, spec.space);
  ascii(b, 20, spec.pcs ?? (spec.space === 'CMYK' ? 'Lab ' : 'XYZ '));
  ascii(b, 36, 'acsp');
  D50.forEach((x, i) => v.setInt32(68 + i * 4, s15(x)));
  v.setUint32(128, tags.length);
  tags.forEach(([sig, d], i) => {
    ascii(b, 132 + i * 12, sig);
    v.setUint32(136 + i * 12, at[i]);
    v.setUint32(140 + i * 12, d.length);
    b.set(d, at[i]);
  });
  return b;
}

function tag(type: string, len: number, fill: (v: DataView) => void): Uint8Array {
  const b = new Uint8Array(len);
  ascii(b, 0, type);
  fill(new DataView(b.buffer));
  return b;
}

export const xyzTag = (x: number, y: number, z: number) =>
  tag('XYZ ', 20, (v) => [x, y, z].forEach((c, i) => v.setInt32(8 + i * 4, s15(c))));

/** `curv` with no entries: the identity. */
export const identityCurve = () => tag('curv', 12, () => {});

/** `curv` with one entry: a gamma, in 8.8 fixed point. */
export const gammaCurve = (g: number) =>
  tag('curv', 14, (v) => {
    v.setUint32(8, 1);
    v.setUint16(12, Math.round(g * 256));
  });

/** `curv` with `n` entries sampled from `f`. */
export const tableCurve = (f: (x: number) => number, n: number) =>
  tag('curv', 12 + n * 2, (v) => {
    v.setUint32(8, n);
    for (let i = 0; i < n; i++) v.setUint16(12 + i * 2, Math.round(clamp01(f(i / (n - 1))) * 65535));
  });

/** `para` of the given function type (0–4). */
export const paraCurve = (type: number, params: number[]) =>
  tag('para', 12 + params.length * 4, (v) => {
    v.setUint16(8, type);
    params.forEach((p, i) => v.setInt32(12 + i * 4, s15(p)));
  });

export interface MftOptions {
  inputs?: number;
  /** Entries per input and output table (`mft2` only; `mft1` always has 256). */
  entries?: number;
}

/**
 * A device → PCS table, `mft1` (8-bit) or `mft2` (16-bit): identity curves, and `fn` giving the three encoded outputs
 * (0…1) at each grid node, the first input varying slowest.
 */
export function mftTag(bits: 8 | 16, grid: number, fn: (device: number[]) => number[], opts: MftOptions = {}): Uint8Array {
  const inputs = opts.inputs ?? 4;
  const wide = bits === 16;
  const n = wide ? (opts.entries ?? 256) : 256;
  const unit = wide ? 2 : 1;
  const max = wide ? 65535 : 255;
  const head = wide ? 52 : 48;
  const nodes = grid ** inputs;
  return tag(wide ? 'mft2' : 'mft1', head + (inputs * n + nodes * 3 + 3 * n) * unit, (v) => {
    v.setUint8(8, inputs);
    v.setUint8(9, 3);
    v.setUint8(10, grid);
    [1, 0, 0, 0, 1, 0, 0, 0, 1].forEach((x, i) => v.setInt32(12 + i * 4, s15(x)));
    if (wide) {
      v.setUint16(48, n);
      v.setUint16(50, n);
    }
    let o = head;
    const put = (x: number) => {
      const q = Math.round(clamp01(x) * max);
      if (wide) v.setUint16(o, q);
      else v.setUint8(o, q);
      o += unit;
    };
    for (let c = 0; c < inputs; c++) for (let i = 0; i < n; i++) put(i / (n - 1));
    for (let i = 0; i < nodes; i++) {
      const device = Array.from({ length: inputs }, (_, d) => (Math.floor(i / grid ** (inputs - 1 - d)) % grid) / (grid - 1));
      for (const x of fn(device)) put(x);
    }
    for (let c = 0; c < 3; c++) for (let i = 0; i < n; i++) put(i / (n - 1));
  });
}

// ── PCS encodings ─────────────────────────────────────────────────────────────────────────────────────────────────

export const lab8 = ([L, a, b]: Triple): Triple => [L / 100, (a + 128) / 255, (b + 128) / 255];
/** Legacy 16-bit Lab (ICC v2, and `mft2` in v4): L 100 ↔ 0xFF00, a/b 0 ↔ 0x8000. */
export const lab16 = ([L, a, b]: Triple): Triple => [
  ((L / 100) * 65280) / 65535,
  ((a + 128) * 256) / 65535,
  ((b + 128) * 256) / 65535,
];
/** 16-bit XYZ: 1.0 ↔ 0x8000. */
export const xyz16 = (xyz: Triple): Triple => xyz.map((x) => (x * 32768) / 65535) as Triple;

export function xyzToLab([X, Y, Z]: Triple): Triple {
  const f = (t: number) => (t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29);
  const [fx, fy, fz] = [f(X / D50[0]), f(Y / D50[1]), f(Z / D50[2])];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const mulV = (m: number[], x: number[]): Triple => [0, 1, 2].map((r) => m[r * 3] * x[0] + m[r * 3 + 1] * x[1] + m[r * 3 + 2] * x[2]) as Triple;

/** Linear sRGB → XYZ (D50): sRGB's colourants adapted to D50 (Bradford). */
const SRGB_TO_XYZ = [0.4360747, 0.3850649, 0.1430804, 0.2225045, 0.7168786, 0.0606169, 0.0139322, 0.0971045, 0.7141733];

export const srgbDecode = (x: number) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);

// ── A made-up press, with a known answer ──────────────────────────────────────────────────────────────────────────

/** Each ink at full strength on white, as sRGB. */
export const INKS: Triple[] = [
  [0, 164, 219],
  [215, 21, 126],
  [255, 241, 8],
  [26, 26, 26],
];
const INK_LINEAR = INKS.map((ink) => ink.map((x) => srgbDecode(x / 255)));

/** The press: each ink filters the light it covers, in linear light. CMYK 0…1 → linear sRGB. */
export function pressLinear(cmyk: number[]): Triple {
  return [0, 1, 2].map((ch) => cmyk.reduce((acc, t, i) => acc * (1 - t * (1 - INK_LINEAR[i][ch])), 1)) as Triple;
}

/** What converting through a press profile must give: sRGB 0…255, unrounded. */
export const pressSrgb = (cmyk: number[]): Triple => pressLinear(cmyk).map((x) => 255 * srgbEncode(x)) as Triple;

/** The black of ICC v4's perceptual reference medium (XYZ). */
const PRM_BLACK = [0.00336, 0.0034731, 0.00287];

export interface PressOptions {
  bits?: 8 | 16;
  grid?: number;
  version?: number;
  pcs?: 'Lab ' | 'XYZ ';
}

/**
 * A CMYK output profile of the press. A v4 one puts its black at the perceptual reference medium's black, as v4
 * perceptual tables do, so a reader has to map it back to 0.
 */
export function pressProfile(opts: PressOptions = {}): Uint8Array {
  const bits = opts.bits ?? 16;
  const pcs = opts.pcs ?? 'Lab ';
  const v4 = (opts.version ?? 2) >= 4;
  const xyz = (cmyk: number[]): Triple => {
    const x = mulV(SRGB_TO_XYZ, pressLinear(cmyk));
    return v4 ? (x.map((c, i) => PRM_BLACK[i] + c * (1 - PRM_BLACK[i] / D50[i])) as Triple) : x;
  };
  const encode = (cmyk: number[]) =>
    pcs === 'XYZ ' ? xyz16(xyz(cmyk)) : bits === 8 ? lab8(xyzToLab(xyz(cmyk))) : lab16(xyzToLab(xyz(cmyk)));
  return iccProfile({ space: 'CMYK', pcs, version: opts.version }, [['A2B0', mftTag(bits, opts.grid ?? 9, encode)]]);
}

/**
 * A press whose light is an affine function of the inks (each channel 1 down to 0.1): any interpolation in linear
 * light reproduces it exactly, so a converter's arithmetic can be checked to the rounding.
 */
const AFFINE = [
  [0.5, 0.1, 0.05, 0.25],
  [0.1, 0.45, 0.1, 0.25],
  [0.05, 0.1, 0.5, 0.25],
];
export const affineLinear = (cmyk: number[]): Triple => AFFINE.map((w) => 1 - w.reduce((s, wi, i) => s + wi * cmyk[i], 0)) as Triple;
export const affineProfile = () =>
  iccProfile({ space: 'CMYK', pcs: 'XYZ ' }, [['A2B0', mftTag(16, 9, (cmyk) => xyz16(mulV(SRGB_TO_XYZ, affineLinear(cmyk))))]]);

// ── RGB profiles from their primaries ─────────────────────────────────────────────────────────────────────────────

const inv3 = (m: number[]): number[] => {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = f * g - d * i;
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [A, c * h - b * i, b * f - c * e, B, a * i - c * g, c * d - a * f, C, b * g - a * h, a * e - b * d].map((x) => x / det);
};
const mul3 = (p: number[], q: number[]): number[] =>
  [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => p[r * 3] * q[c] + p[r * 3 + 1] * q[3 + c] + p[r * 3 + 2] * q[6 + c]));
const xyzOf = ([x, y]: Xy) => [x / y, 1, (1 - x - y) / y];
const BRADFORD = [0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296];

/** Linear RGB → XYZ (D50), as a profile stores it: colourants as columns, adapted from `white` to D50 (Bradford). */
export function colourants(primaries: Xy[], white: Xy): number[] {
  const P = [0, 1, 2].flatMap((r) => primaries.map((p) => xyzOf(p)[r]));
  const W = xyzOf(white);
  const S = mulV(inv3(P), W);
  const M = P.map((x, i) => x * S[i % 3]);
  const src = mulV(BRADFORD, W);
  const dst = mulV(BRADFORD, [...D50]);
  const scale = [dst[0] / src[0], 0, 0, 0, dst[1] / src[1], 0, 0, 0, dst[2] / src[2]];
  return mul3(mul3(mul3(inv3(BRADFORD), scale), BRADFORD), M);
}

export const D65: Xy = [0.3127, 0.329];
export const SRGB: Xy[] = [
  [0.64, 0.33],
  [0.3, 0.6],
  [0.15, 0.06],
];
export const ADOBE_RGB: Xy[] = [
  [0.64, 0.33],
  [0.21, 0.71],
  [0.15, 0.06],
];
export const DISPLAY_P3: Xy[] = [
  [0.68, 0.32],
  [0.265, 0.69],
  [0.15, 0.06],
];
export const PROPHOTO: Xy[] = [
  [0.7347, 0.2653],
  [0.1596, 0.8404],
  [0.0366, 0.0001],
];
const D50_XY: Xy = [0.3457, 0.3585];

/** The sRGB curve as a `para` type 3. */
export const SRGB_PARA = [2.4, 1 / 1.055, 0.055 / 1.055, 1 / 12.92, 0.04045];

/** A matrix/TRC RGB profile; `m` is linear RGB → XYZ (D50), row-major. */
export function rgbProfile(m: number[], curve: Uint8Array, version = 2): Uint8Array {
  return iccProfile({ space: 'RGB ', version }, [
    ['rXYZ', xyzTag(m[0], m[3], m[6])],
    ['gXYZ', xyzTag(m[1], m[4], m[7])],
    ['bXYZ', xyzTag(m[2], m[5], m[8])],
    ['rTRC', curve],
    ['gTRC', curve],
    ['bTRC', curve],
  ]);
}

/** The colourants of the HP / Microsoft "sRGB IEC61966-2.1" profile, the one Photoshop and Windows embed. */
const HP_SRGB = [0.436066, 0.385147, 0.143066, 0.222488, 0.716873, 0.060608, 0.013916, 0.097076, 0.714096];

export const RGB_PROFILES = {
  /** Like HP's sRGB: its colourants and a 1024-entry curve. */
  srgbHp: () => rgbProfile(HP_SRGB, tableCurve(srgbDecode, 1024)),
  /** sRGB as a v4 profile builds it: colourants from the primaries, a parametric curve. */
  srgbPara: () => rgbProfile(colourants(SRGB, D65), paraCurve(3, SRGB_PARA), 4),
  adobe: () => rgbProfile(colourants(ADOBE_RGB, D65), gammaCurve(563 / 256)),
  displayP3: () => rgbProfile(colourants(DISPLAY_P3, D65), paraCurve(3, SRGB_PARA), 4),
  prophoto: () => rgbProfile(colourants(PROPHOTO, D50_XY), gammaCurve(1.8)),
  /** sRGB's primaries with a plain 2.2 gamma: not sRGB. */
  srgbGamma22: () => rgbProfile(colourants(SRGB, D65), gammaCurve(2.2)),
};

/** An RGB profile made of tables only, as scanner profiles are: not handled, so the file reads as before. */
export const tableOnlyRgbProfile = () =>
  iccProfile({ space: 'RGB ', pcs: 'Lab ' }, [
    ['A2B0', mftTag(16, 5, ([r, g, b]) => lab16(xyzToLab(mulV(SRGB_TO_XYZ, [r, g, b].map(srgbDecode)))), { inputs: 3 })],
  ]);

/** A grey profile: not handled either. */
export const grayProfile = () => iccProfile({ space: 'GRAY' }, [['kTRC', gammaCurve(2.2)]]);
