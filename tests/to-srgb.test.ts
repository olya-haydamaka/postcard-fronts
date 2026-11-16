import UTIF from 'utif';
import { describe, expect, it } from 'vitest';
import { evalLut, parseIcc, scalePerceptualBlack, srgbEncode, xyzD50ToSrgb255, type Icc } from '../src/color/icc';
import { cmykToSrgb, isSrgbLike, plainCmyk, rgbToSrgb, type SampleLayout, type ToSrgb } from '../src/color/to-srgb';
import {
  affineLinear,
  affineProfile,
  grayProfile,
  iccProfile,
  pressProfile,
  pressSrgb,
  RGB_PROFILES,
  tableOnlyRgbProfile,
  type PressOptions,
} from './icc-fixture';

/** Converts whole pixels (one sample per byte) and returns their RGB. */
function convert(f: ToSrgb, px: number[][], layout?: SampleLayout): number[][] {
  const data = Uint8Array.from(px.flat());
  const out = new Uint8ClampedArray(px.length * 4);
  f(data, px.length, layout ?? { spp: px[0].length, bytes: 1, alpha: false }, out);
  return px.map((_, i) => [...out.subarray(i * 4, i * 4 + 3)]);
}

const icc = (bytes: Uint8Array): Icc => parseIcc(bytes)!;

const maxDiff = (a: number[][], b: number[][]) => Math.max(...a.flatMap((p, i) => p.map((x, c) => Math.abs(x - b[i][c]))));

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 2 ** 32);
}

/**
 * LittleCMS 2.17 (Pillow 12.1.1, ImageCms), perceptual, flags 0, on the profiles of `icc-fixture.ts`. Output profile:
 * the HP / Microsoft "sRGB IEC61966-2.1" (v2), except for the v4 profile, which went to LittleCMS's own sRGB (v4):
 * LittleCMS compensates the black point only towards a v4 profile, which is what a v4 perceptual table needs.
 */
const CMYK_IN = [
  [0, 0, 0, 0],
  [255, 0, 0, 0],
  [0, 255, 0, 0],
  [0, 0, 255, 0],
  [0, 0, 0, 255],
  [255, 255, 255, 255],
  [128, 64, 32, 16],
  [10, 200, 90, 40],
  [77, 77, 77, 0],
  [0, 0, 0, 128],
  [200, 30, 160, 10],
  [255, 255, 0, 0],
  [33, 180, 250, 90],
  [1, 2, 3, 4],
  [254, 254, 254, 254],
  [60, 120, 180, 240],
];
const LCMS_CMYK: [string, PressOptions, number[][]][] = [
  ['mft2, Lab', { bits: 16 }, [[255, 255, 255], [0, 164, 219], [215, 21, 126], [255, 241, 8], [26, 26, 26], [0, 0, 0], [175, 183, 197], [205, 115, 125], [208, 195, 185], [188, 188, 188], [122, 169, 137], [0, 9, 107], [177, 110, 13], [252, 252, 251], [0, 1, 0], [48, 39, 27]]],
  ['mft1, Lab', { bits: 8 }, [[255, 255, 255], [0, 164, 219], [215, 21, 126], [255, 241, 14], [26, 26, 26], [0, 0, 0], [174, 183, 197], [204, 115, 124], [208, 195, 185], [188, 188, 188], [123, 169, 138], [1, 9, 107], [177, 110, 14], [252, 252, 251], [0, 1, 0], [48, 39, 26]]],
  ['mft2, XYZ', { bits: 16, pcs: 'XYZ ' }, [[255, 255, 255], [0, 164, 219], [215, 21, 126], [255, 241, 8], [26, 26, 26], [0, 0, 0], [175, 183, 197], [205, 116, 125], [208, 195, 185], [188, 188, 188], [123, 169, 137], [0, 9, 107], [177, 111, 15], [253, 252, 251], [0, 1, 0], [59, 48, 31]]],
  ['mft2, grid 17', { bits: 16, grid: 17 }, [[255, 255, 255], [0, 164, 219], [215, 21, 126], [255, 241, 8], [26, 26, 26], [0, 0, 0], [175, 183, 197], [205, 116, 125], [208, 195, 185], [188, 188, 188], [123, 169, 137], [0, 9, 107], [177, 111, 13], [252, 252, 251], [0, 0, 0], [59, 46, 28]]],
  ['mft2, v4', { bits: 16, version: 4 }, [[255, 255, 255], [0, 164, 219], [215, 21, 126], [255, 241, 8], [26, 26, 26], [0, 0, 0], [175, 183, 197], [205, 115, 125], [208, 195, 185], [188, 188, 188], [122, 169, 137], [0, 9, 107], [177, 110, 13], [252, 252, 251], [0, 1, 0], [49, 40, 26]]],
];
const RGB_IN = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [128, 128, 128],
  [60, 120, 180],
  [250, 200, 40],
  [10, 20, 30],
  [200, 60, 90],
  [0, 0, 0],
  [255, 255, 255],
];
const LCMS_RGB: [keyof typeof RGB_PROFILES, number[][]][] = [
  ['adobe', [[255, 0, 0], [0, 255, 0], [0, 0, 255], [129, 129, 129], [0, 121, 184], [255, 201, 0], [0, 12, 24], [231, 57, 91], [0, 0, 0], [255, 255, 255]]],
  ['displayP3', [[255, 0, 0], [0, 255, 0], [0, 0, 255], [128, 128, 128], [30, 122, 185], [255, 198, 0], [7, 20, 31], [217, 42, 88], [0, 0, 0], [255, 255, 255]]],
  ['prophoto', [[255, 0, 0], [0, 255, 0], [0, 0, 255], [146, 146, 146], [0, 149, 200], [255, 200, 0], [0, 28, 42], [255, 0, 112], [0, 0, 0], [255, 255, 255]]],
  ['srgbGamma22', [[255, 0, 0], [0, 255, 0], [0, 0, 255], [129, 129, 129], [57, 121, 181], [250, 201, 35], [3, 12, 24], [201, 57, 90], [0, 0, 0], [255, 255, 255]]],
];

/** The profile's own answer, without the link: the table evaluated directly, as sRGB 0…255. */
function direct(profile: Icc, cmyk: number[]): number[] {
  const xyz = new Float64Array(3);
  evalLut(profile.a2b0!, cmyk.map((v) => v / 255), xyz);
  if (profile.version >= 4) scalePerceptualBlack(xyz);
  const rgb = new Float64Array(3);
  xyzD50ToSrgb255(xyz, rgb);
  return [...rgb];
}

/**
 * Where a channel nears 0 (here blue, under nearly full yellow), LittleCMS's 8-bit path strays from the profile: it
 * interpolates encoded values, which bend sharply there. This tool interpolates linear light (see `to-srgb.ts`).
 * Measured blue: the press 18.1; the profiles evaluated directly 16.2–21.6; this tool 18–22; LittleCMS 13–15.
 */
const NEAR_EDGE = [33, 180, 250, 90];

describe('CMYK through a profile', () => {
  it.each(LCMS_CMYK)('agrees with LittleCMS within one level, away from the gamut edge (%s)', (_, opts, expected) => {
    const got = convert(cmykToSrgb(icc(pressProfile(opts)))!, CMYK_IN);
    CMYK_IN.forEach((px, i) => {
      if (px.join() !== NEAR_EDGE.join()) expect(maxDiff([got[i]], [expected[i]]), `${px}`).toBeLessThanOrEqual(1);
    });
  });

  it.each(LCMS_CMYK)('follows the profile at the gamut edge, where LittleCMS undershoots (%s)', (_, opts, expected) => {
    const profile = icc(pressProfile(opts));
    const [got] = convert(cmykToSrgb(profile)!, [NEAR_EDGE]);
    const want = direct(profile, NEAR_EDGE);
    const lcms = expected[CMYK_IN.findIndex((px) => px.join() === NEAR_EDGE.join())];
    expect(Math.abs(got[2] - want[2])).toBeLessThanOrEqual(2);
    expect(want[2] - lcms[2]).toBeGreaterThanOrEqual(3);
  });

  it('interpolates exactly: an affine press comes out to the rounding, at every value of every axis', () => {
    const f = cmykToSrgb(icc(affineProfile()))!;
    const rnd = seeded(11);
    const px: number[][] = [];
    for (let axis = 0; axis < 4; axis++) {
      for (const rest of [0, 100, 255]) for (let v = 0; v < 256; v++) px.push([0, 1, 2, 3].map((a) => (a === axis ? v : rest)));
    }
    for (let i = 0; i < 20000; i++) px.push([0, 1, 2, 3].map(() => Math.floor(rnd() * 256)));
    const got = convert(f, px);
    px.forEach((p, i) => {
      const want = affineLinear(p.map((v) => v / 255)).map((x) => 255 * srgbEncode(x));
      for (let c = 0; c < 3; c++) expect(Math.abs(got[i][c] - want[c]), `${p}`).toBeLessThanOrEqual(0.6);
    });
  });

  it('stays close to the press it was made from, between all the nodes', () => {
    const f = cmykToSrgb(icc(pressProfile({ bits: 16, grid: 17 })))!;
    const rnd = seeded(13);
    const px = Array.from({ length: 20000 }, () => [0, 1, 2, 3].map(() => Math.floor(rnd() * 256)));
    const got = convert(f, px);
    const diffs = px.flatMap((p, i) => pressSrgb(p.map((v) => v / 255)).map((x, c) => Math.abs(x - got[i][c])));
    // What a 17-point link costs, measured once: mean 0.28, max 3.6 levels.
    expect(diffs.reduce((s, d) => s + d, 0) / diffs.length).toBeLessThan(0.4);
    expect(Math.max(...diffs)).toBeLessThan(4.5);
  });

  it('puts the black of a v4 perceptual table at 0, where the table alone leaves it grey', () => {
    const v4 = icc(pressProfile({ version: 4 }));
    const xyz = new Float64Array(3);
    const rgb = new Float64Array(3);
    evalLut(v4.a2b0!, [1, 1, 1, 1], xyz);
    xyzD50ToSrgb255(xyz, rgb);
    expect(Math.min(...rgb)).toBeGreaterThan(8); // about (11, 11, 11) without the compensation
    scalePerceptualBlack(xyz);
    xyzD50ToSrgb255(xyz, rgb);
    expect([...rgb].map(Math.round)).toEqual([0, 0, 0]);
    expect(convert(cmykToSrgb(v4)!, [[255, 255, 255, 255]])).toEqual([[0, 0, 0]]);
  });

  it('reads 16-bit samples by their high byte, and copies alpha', () => {
    const f = cmykToSrgb(icc(pressProfile()))!;
    const px = [
      [10, 200, 90, 40, 77],
      [255, 0, 0, 0, 255],
      [0, 0, 0, 0, 0],
    ];
    const eight = convert(f, px.map((p) => p.slice(0, 4)));
    // Little-endian, as UTIF leaves 16-bit samples; the low bytes are noise.
    const data = Uint8Array.from(px.flatMap((p) => p.flatMap((v, i) => [(v * 7 + i) & 255, v])));
    const out = new Uint8ClampedArray(px.length * 4);
    f(data, px.length, { spp: 5, bytes: 2, alpha: true }, out);
    px.forEach((p, i) => {
      expect([...out.subarray(i * 4, i * 4 + 3)]).toEqual(eight[i]);
      expect(out[i * 4 + 3]).toBe(p[4]);
    });
  });

  it('has nothing to offer for a profile that is not CMYK, or has no table', () => {
    expect(cmykToSrgb(icc(RGB_PROFILES.adobe()))).toBeNull();
    expect(cmykToSrgb(icc(iccProfile({ space: 'CMYK' }, [])))).toBeNull();
  });
});

describe('CMYK without a profile', () => {
  it("is UTIF's own formula, colour for colour, and opaque", () => {
    const rnd = seeded(5);
    const n = 5000;
    const data = Uint8Array.from({ length: n * 4 }, () => Math.floor(rnd() * 256));
    const ours = new Uint8ClampedArray(n * 4);
    plainCmyk(data, n, { spp: 4, bytes: 1, alpha: false }, ours);
    const utif = UTIF.toRGBA8({ width: n, height: 1, t262: [5], t258: [8, 8, 8, 8], data });
    for (let i = 0; i < n * 4; i++) {
      // UTIF reads the last pixel's alpha past the end of the data and leaves it transparent; the rest is 255.
      if (i % 4 === 3) expect(ours[i]).toBe(255);
      else expect(ours[i], `byte ${i}`).toBe(utif[i]);
    }
  });
});

describe('RGB through a profile', () => {
  it.each(LCMS_RGB)('matches LittleCMS within one level (%s)', (name, expected) => {
    const f = rgbToSrgb(icc(RGB_PROFILES[name]()))!;
    expect(maxDiff(convert(f, RGB_IN), expected)).toBeLessThanOrEqual(1);
  });

  it("follows Adobe RGB's own curve, gamma 563/256, along the greys", () => {
    const f = rgbToSrgb(icc(RGB_PROFILES.adobe()))!;
    const greys = Array.from({ length: 256 }, (_, v) => [v, v, v]);
    convert(f, greys).forEach(([r, g, b], v) => {
      const want = 255 * srgbEncode(Math.pow(v / 255, 563 / 256));
      for (const x of [r, g, b]) expect(Math.abs(x - want), `grey ${v}`).toBeLessThan(0.6);
    });
  });

  it('leaves sRGB alone, and only sRGB', () => {
    expect(isSrgbLike(icc(RGB_PROFILES.srgbHp()))).toBe(true);
    expect(isSrgbLike(icc(RGB_PROFILES.srgbPara()))).toBe(true);
    expect(rgbToSrgb(icc(RGB_PROFILES.srgbHp()))).toBeNull();
    expect(rgbToSrgb(icc(RGB_PROFILES.srgbPara()))).toBeNull();
    // Near misses: sRGB's primaries with a 2.2 gamma, and Display P3, which has sRGB's curve.
    for (const name of ['srgbGamma22', 'displayP3', 'adobe', 'prophoto'] as const) {
      expect(isSrgbLike(icc(RGB_PROFILES[name]())), name).toBe(false);
    }
  });

  it('has nothing to offer for tables only, grey, or CMYK', () => {
    expect(rgbToSrgb(icc(tableOnlyRgbProfile()))).toBeNull();
    expect(rgbToSrgb(icc(grayProfile()))).toBeNull();
    expect(rgbToSrgb(icc(pressProfile()))).toBeNull();
  });

  it('reads 16-bit samples by their high byte, and copies alpha', () => {
    const f = rgbToSrgb(icc(RGB_PROFILES.adobe()))!;
    const px = [
      [60, 120, 180, 9],
      [250, 200, 40, 255],
    ];
    const eight = convert(f, px.map((p) => p.slice(0, 3)));
    const data = Uint8Array.from(px.flatMap((p) => p.flatMap((v, i) => [(v * 3 + i) & 255, v])));
    const out = new Uint8ClampedArray(px.length * 4);
    f(data, px.length, { spp: 4, bytes: 2, alpha: true }, out);
    px.forEach((p, i) => {
      expect([...out.subarray(i * 4, i * 4 + 3)]).toEqual(eight[i]);
      expect(out[i * 4 + 3]).toBe(p[3]);
    });
  });
});
