import { describe, expect, it } from 'vitest';
import { evalLut, labToXyz, parseIcc, srgbEncode, xyzD50ToSrgb255, type Lut } from '../src/color/icc';
import { cmykToSrgb, rgbToSrgb } from '../src/color/to-srgb';
import {
  colourants,
  D65,
  gammaCurve,
  iccProfile,
  identityCurve,
  mftTag,
  paraCurve,
  pressProfile,
  pressSrgb,
  RGB_PROFILES,
  rgbProfile,
  SRGB,
  SRGB_PARA,
  srgbDecode,
  tableCurve,
  type Triple,
} from './icc-fixture';

const srgbOfLab = (lab: Triple): number[] => {
  const xyz = new Float64Array(3);
  labToXyz(lab[0], lab[1], lab[2], xyz);
  const out = new Float64Array(3);
  xyzD50ToSrgb255(xyz, out);
  return [...out];
};

/** A CMYK device value (0…1 each) through the table, as sRGB 0…255. */
function lutSrgb(lut: Lut, cmyk: number[]): number[] {
  const xyz = new Float64Array(3);
  evalLut(lut, cmyk, xyz);
  const out = new Float64Array(3);
  xyzD50ToSrgb255(xyz, out);
  return [...out];
}

/** Every grid node of a 9-point grid, a few hundred of them, spread out. */
const NODES = Array.from({ length: 300 }, (_, i) => [0, 1, 2, 3].map((d) => ((i * [7, 3, 5, 1][d] + d) % 9) / 8));

const maxDiff = (a: number[], b: number[]) => Math.max(...a.map((x, i) => Math.abs(x - b[i])));

/** A deterministic generator: the same numbers on every run. */
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 2 ** 32);
}

describe('Lab and XYZ to sRGB', () => {
  it('puts white, middle grey and black where they belong', () => {
    expect(srgbOfLab([100, 0, 0]).map(Math.round)).toEqual([255, 255, 255]);
    expect(srgbOfLab([50, 0, 0]).map(Math.round)).toEqual([119, 119, 119]);
    expect(srgbOfLab([0, 0, 0]).map(Math.round)).toEqual([0, 0, 0]);
  });

  it('clips colours outside sRGB instead of wrapping them', () => {
    // Lab (60, -120, 0) is far outside sRGB on the green side: its linear red is below 0.
    const rgb = srgbOfLab([60, -120, 0]);
    expect(rgb[0]).toBe(0);
    expect(rgb[1]).toBeGreaterThan(150);
    for (const x of rgb) expect(x >= 0 && x <= 255).toBe(true);
  });
});

describe('parseIcc: an RGB profile', () => {
  it('reads the colourants as the columns of a row-major matrix, and the three curves', () => {
    const m = colourants(SRGB, D65);
    const icc = parseIcc(rgbProfile(m, gammaCurve(2.2)))!;
    expect(icc.space).toBe('RGB ');
    expect(icc.version).toBe(2);
    expect(icc.a2b0).toBeNull();
    [...icc.matrix!].forEach((x, i) => expect(x).toBeCloseTo(m[i], 4));
    expect(icc.trc!.map((c) => c(0.5))).toEqual(Array(3).fill(Math.pow(0.5, Math.round(2.2 * 256) / 256)));
  });

  it('reads curv with 0, 1 and n entries, and para types 0–4 as their formulas', () => {
    const curveOf = (curve: Uint8Array) => parseIcc(rgbProfile(colourants(SRGB, D65), curve))!.trc![0];
    const xs = [0, 0.001, 0.02, 0.04045, 0.1, 0.5, 0.77, 1];
    const check = (curve: Uint8Array, f: (x: number) => number, digits = 6) => {
      const c = curveOf(curve);
      // A curve's output is clipped to 0…1, as LittleCMS clips it.
      for (const x of xs) expect(c(x), `x = ${x}`).toBeCloseTo(Math.min(1, Math.max(0, f(x))), digits);
    };
    check(identityCurve(), (x) => x);
    check(gammaCurve(1.8), (x) => Math.pow(x, 461 / 256));
    check(tableCurve(srgbDecode, 4096), srgbDecode, 4);
    const [g, a, b, c, d, e, f] = [2.2, 0.9, 0.1, 0.05, 0.08, 0.01, 0.02];
    check(paraCurve(0, [g]), (x) => Math.pow(x, g), 4);
    check(paraCurve(1, [g, a, b]), (x) => (x >= -b / a ? Math.pow(a * x + b, g) : 0), 4);
    check(paraCurve(2, [g, a, b, c]), (x) => (x >= -b / a ? Math.pow(a * x + b, g) + c : c), 4);
    check(paraCurve(3, SRGB_PARA), srgbDecode, 4);
    check(paraCurve(4, [g, a, b, c, d, e, f]), (x) => (x >= d ? Math.pow(a * x + b, g) + e : c * x + f), 4);
  });

  it('leaves an RGB profile without colourants or curves unread', () => {
    const icc = parseIcc(iccProfile({ space: 'RGB ' }, [['rTRC', gammaCurve(2.2)]]))!;
    expect(icc.matrix).toBeNull();
    expect(icc.trc).toBeNull();
  });
});

describe('parseIcc: a CMYK table', () => {
  it('decodes 8-bit Lab (mft1), legacy 16-bit Lab (mft2) and XYZ to the colours they encode', () => {
    for (const [opts, tolerance] of [
      [{ bits: 8 }, 3], // Lab in 8 bits: L in steps of 0.39, a and b in steps of 1
      [{ bits: 16 }, 0.1],
      [{ bits: 16, pcs: 'XYZ ' }, 0.2],
    ] as const) {
      const lut = parseIcc(pressProfile(opts))!.a2b0!;
      expect(lut.pcs).toBe(opts.bits === 8 ? 'lab8' : 'pcs' in opts ? 'xyz' : 'lab16');
      for (const node of NODES) expect(maxDiff(lutSrgb(lut, node), pressSrgb(node)), `${JSON.stringify(opts)} at ${node}`).toBeLessThan(tolerance);
    }
  });

  it('orders the grid with the first input slowest, and reads inputs of 0 and 1 without leaving it', () => {
    // A linear table: tetrahedral and linear interpolation reproduce it exactly, so any swapped stride shows.
    const W = [
      [0.1, 0.2, 0.3, 0.35],
      [0.35, 0.3, 0.2, 0.1],
      [0.4, 0.05, 0.25, 0.3],
    ];
    const linear = (x: number[]) => W.map((w) => w.reduce((s, wi, i) => s + wi * x[i], 0));
    const lut = parseIcc(iccProfile({ space: 'CMYK', pcs: 'XYZ ' }, [['A2B0', mftTag(16, 5, linear)]]))!.a2b0!;
    const k = 65535 / 32768;
    const rnd = seeded(7);
    const inputs = [
      ...Array.from({ length: 16 }, (_, i) => [0, 1, 2, 3].map((b) => (i >> b) & 1)),
      ...Array.from({ length: 500 }, () => [rnd(), rnd(), rnd(), rnd()]),
    ];
    const xyz = new Float64Array(3);
    for (const x of inputs) {
      evalLut(lut, x, xyz);
      linear(x).forEach((v, i) => expect(xyz[i], `${x}`).toBeCloseTo(v * k, 4));
    }
  });
});

describe('parseIcc: malformed profiles', () => {
  const good = () => pressProfile({ bits: 16, grid: 5 });

  it('returns null for a broken header or tag table', () => {
    const cases: [string, (b: Uint8Array, v: DataView) => void][] = [
      ['too short', () => {}],
      ['no acsp', (b) => b.set([0, 0, 0, 0], 36)],
      ['size past the end', (_, v) => v.setUint32(0, v.byteLength + 1)],
      ['tag table past the end', (_, v) => v.setUint32(128, 1e6)],
      ['tag past the end', (_, v) => v.setUint32(136, v.byteLength)],
    ];
    for (const [name, spoil] of cases) {
      const b = name === 'too short' ? good().slice(0, 100) : good();
      spoil(b, new DataView(b.buffer));
      expect(parseIcc(b), name).toBeNull();
    }
  });

  it('refuses a table whose declared size is larger than the tag, before allocating it', () => {
    const b = good();
    const a2b0 = new DataView(b.buffer).getUint32(136);
    b[a2b0 + 10] = 255; // a grid of 255 declares 255⁴ × 3 cells: 12.7 G
    expect(parseIcc(b)?.a2b0).toBeNull();
  });

  it('never throws, whatever the bytes: truncations, tags cut short, and 2000 random flips', () => {
    const rnd = seeded(2026);
    const sources = [good(), RGB_PROFILES.displayP3(), RGB_PROFILES.srgbHp()];
    let links = 0;
    const tryAll = (b: Uint8Array) => {
      const icc = parseIcc(b);
      if (!icc) return;
      // Building a converter runs every reader on whatever was parsed. A CMYK link takes ~0.1 s: only some.
      if (icc.space === 'RGB ') rgbToSrgb(icc);
      if (icc.space === 'CMYK' && icc.a2b0 && links++ < 12) cmykToSrgb(icc);
    };
    for (const src of sources) {
      // The whole profile cut short, its declared size following, so the header and tag table get read.
      for (let n = 0; n < Math.min(src.length, 600); n++) {
        const b = src.slice(0, n);
        if (n >= 4) new DataView(b.buffer).setUint32(0, n);
        expect(() => tryAll(b), `truncated at ${n}`).not.toThrow();
      }
      // Each tag declared shorter than it is, so its reader meets the end of its data.
      const tags = new DataView(src.buffer).getUint32(128);
      for (let t = 0; t < tags; t++) {
        const full = new DataView(src.buffer).getUint32(140 + t * 12);
        for (let n = 0; n <= full; n += 1 + Math.floor(full / 40)) {
          const b = src.slice();
          new DataView(b.buffer).setUint32(140 + t * 12, n);
          expect(() => tryAll(b), `tag ${t} cut to ${n}`).not.toThrow();
        }
      }
      for (let i = 0; i < 2000 / sources.length; i++) {
        const b = src.slice();
        for (let f = 0; f < 1 + Math.floor(rnd() * 4); f++) {
          // Half the flips land in the header, the tag table and the tags' own headers, where they matter most.
          const at = Math.floor(rnd() * (rnd() < 0.5 ? Math.min(b.length, 400) : b.length));
          b[at] = Math.floor(rnd() * 256);
        }
        expect(() => tryAll(b), `flip ${i}`).not.toThrow();
      }
    }
  });
});

describe('the sRGB curve', () => {
  it('round-trips every 8-bit code', () => {
    for (let v = 0; v < 256; v++) expect(255 * srgbEncode(srgbDecode(v / 255))).toBeCloseTo(v, 9);
  });
});
