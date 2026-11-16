import UTIF from 'utif';
import { describe, expect, it } from 'vitest';
import { parseIcc } from '../src/color/icc';
import { cmykToSrgb, rgbToSrgb } from '../src/color/to-srgb';
import { largestIfd, tiffPixels } from '../src/io/tiff-pixels';
import { grayProfile, pressProfile, RGB_PROFILES, tableOnlyRgbProfile } from './icc-fixture';
import { arrayBuffer, writeTiff, type TiffSpec } from './tiff-fixture';

const W = 37;
const H = 23;

function noise(n: number, seed: number): number[] {
  let s = seed;
  return Array.from({ length: n }, () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) >>> 24);
}
const CMYK = noise(W * H * 4, 1);
const RGB = noise(W * H * 3, 2);
const ALPHA = noise(W * H, 3);

/** UTIF's own reading of a file: how the tool read every TIFF before. */
function utifRgba(file: Buffer): Uint8Array {
  const buf = arrayBuffer(file);
  const ifds = UTIF.decode(buf);
  UTIF.decodeImage(buf, ifds[0], ifds);
  return UTIF.toRGBA8(ifds[0]);
}

const read = (file: Buffer) => tiffPixels(arrayBuffer(file)).rgba;
const same = (a: ArrayLike<number>, b: ArrayLike<number>) => Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;

const cmykFile = (spec: Partial<TiffSpec> = {}) => writeTiff({ w: W, h: H, samples: CMYK, spp: 4, photometric: 5, ...spec });
const rgbFile = (spec: Partial<TiffSpec> = {}) => writeTiff({ w: W, h: H, samples: RGB, spp: 3, photometric: 2, ...spec });

/** Interleaves the alpha samples after the colours. */
const withAlpha = (colours: number[], per: number) => colours.flatMap((v, i) => (i % per === per - 1 ? [v, ALPHA[(i / per) | 0]] : [v]));

/** The 16-bit version of 8-bit samples: those as the high bytes, noise as the low ones. */
const wide = (samples: number[]) => samples.map((v, i) => (v << 8) | ((i * 37 + 11) & 255));

describe('TIFF pixels: what reads as before', () => {
  it('untagged RGB and untagged 8-bit CMYK read exactly as UTIF reads them', () => {
    for (const file of [
      rgbFile({ compression: 'lzw', predictor: true, rowsPerStrip: 9 }),
      cmykFile({ compression: 'lzw', predictor: true, rowsPerStrip: 9 }),
      cmykFile({ order: 'MM', compression: 'deflate' }),
    ]) {
      expect(same(read(file), utifRgba(file))).toBe(true);
    }
  });

  it('an sRGB profile changes nothing, byte for byte: HP-style and v4 parametric', () => {
    const plain = read(rgbFile());
    for (const icc of [RGB_PROFILES.srgbHp(), RGB_PROFILES.srgbPara()]) {
      expect(same(read(rgbFile({ icc })), plain)).toBe(true);
    }
  });

  it('profiles and layouts it does not handle read exactly as UTIF reads them', () => {
    const press = pressProfile();
    const adobe = RGB_PROFILES.adobe();
    const cases: [string, Buffer][] = [
      ['RGB, tables only (a scanner profile)', rgbFile({ icc: tableOnlyRgbProfile() })],
      ['RGB with a grey profile', rgbFile({ icc: grayProfile() })],
      ['RGB with a CMYK profile', rgbFile({ icc: press })],
      ['CMYK with an RGB profile', cmykFile({ icc: adobe })],
      ['planar', rgbFile({ icc: adobe, tags: [[284, 3, [2]]] })],
      ['InkSet: not CMYK', cmykFile({ icc: press, tags: [[332, 3, [2]]] })],
      ['five inks', cmykFile({ icc: press, tags: [[334, 3, [5]]] })],
      ['floating-point samples', rgbFile({ icc: adobe, tags: [[339, 3, [3, 3, 3]]] })],
      ['six samples', writeTiff({ w: W, h: H, samples: noise(W * H * 6, 4), spp: 6, photometric: 5, icc: press, tags: [[338, 3, [0, 0]]] })],
      ['a fourth sample without ExtraSamples', writeTiff({ w: W, h: H, samples: withAlpha(RGB, 3), spp: 4, photometric: 2, icc: adobe })],
      ['strips missing', rgbFile({ icc: adobe, rowsPerStrip: 9, dropLastStrip: true })],
    ];
    for (const [name, file] of cases) expect(same(read(file), utifRgba(file)), name).toBe(true);
  });
});

describe('TIFF pixels: through the profile', () => {
  it("converts a CMYK file shaped like a painter's: MM, LZW, predictor, short last strip, profile at an odd offset", () => {
    const icc = pressProfile();
    const file = cmykFile({
      order: 'MM',
      compression: 'lzw',
      predictor: true,
      rowsPerStrip: 9,
      icc,
      iccOddOffset: true,
      tags: [[339, 3, [1, 1, 1, 1]]],
    });
    expect(UTIF.decode(arrayBuffer(file))[0].t34675).toSatisfy((t: Uint8Array) => t.byteOffset % 2 === 1);
    const want = new Uint8ClampedArray(W * H * 4);
    cmykToSrgb(parseIcc(icc)!)!(Uint8Array.from(CMYK), W * H, { spp: 4, bytes: 1, alpha: false }, want);
    expect(same(read(file), want)).toBe(true);
    expect(same(read(file), utifRgba(file))).toBe(false);
  });

  it('converts an RGB file with a wider profile (Adobe RGB)', () => {
    const icc = RGB_PROFILES.adobe();
    const want = new Uint8ClampedArray(W * H * 4);
    rgbToSrgb(parseIcc(icc)!)!(Uint8Array.from(RGB), W * H, { spp: 3, bytes: 1, alpha: false }, want);
    expect(same(read(rgbFile({ icc })), want)).toBe(true);
    expect(same(read(rgbFile({ icc })), read(rgbFile()))).toBe(false);
  });

  it('reads 16-bit samples by their high byte, in both byte orders, with and without the predictor', () => {
    for (const [make, samples, icc] of [
      [cmykFile, CMYK, pressProfile()],
      [rgbFile, RGB, RGB_PROFILES.adobe()],
    ] as const) {
      const eight = read(make({ icc }));
      for (const order of ['II', 'MM'] as const) {
        for (const predictor of [false, true]) {
          const file = make({ samples: wide(samples), bits: 16, order, predictor, compression: 'deflate', icc });
          expect(same(read(file), eight), `${order}${predictor ? ', predictor' : ''}`).toBe(true);
        }
      }
    }
  });

  it("reads untagged 16-bit CMYK by UTIF's formula on the high bytes, which UTIF itself misreads", () => {
    const got = read(cmykFile({ samples: wide(CMYK), bits: 16 }));
    const want = utifRgba(cmykFile());
    for (let i = 0; i < W * H * 4; i++) {
      // UTIF leaves the last pixel's alpha at 0, reading past the end of its data; here every pixel is opaque.
      if (i % 4 === 3) expect(got[i]).toBe(255);
      else expect(got[i], `byte ${i}`).toBe(want[i]);
    }
  });

  it('copies alpha exactly, 8-bit and 16-bit', () => {
    for (const [colours, per, icc, photometric] of [
      [CMYK, 4, pressProfile(), 5],
      [RGB, 3, RGB_PROFILES.adobe(), 2],
    ] as const) {
      const opaque = read(writeTiff({ w: W, h: H, samples: colours, spp: per, photometric, icc }));
      for (const bits of [8, 16] as const) {
        const samples = withAlpha(colours, per);
        const file = writeTiff({
          w: W,
          h: H,
          samples: bits === 16 ? wide(samples) : samples,
          bits,
          spp: per + 1,
          photometric,
          icc,
          tags: [[338, 3, [2]]],
        });
        const got = read(file);
        for (let i = 0; i < W * H; i++) {
          expect(got[i * 4 + 3]).toBe(ALPHA[i]);
          for (let c = 0; c < 3; c++) expect(got[i * 4 + c]).toBe(opaque[i * 4 + c]);
        }
      }
    }
  });
});

describe('TIFF pixels: the image', () => {
  it('is the largest one: a thumbnail may come first', () => {
    const thumb = { t256: [16], t257: [12] };
    const full = { t256: [3543], t257: [4724] };
    expect(largestIfd([thumb, full, { width: 100, height: 100 }])).toBe(full);
  });
});
