import UTIF from 'utif';
import { describe, expect, it } from 'vitest';
import { encodeTiffRgb, packBitsRow } from '../src/io/tiff-encode';
import { evalPrototype, prototypeSource } from './prototype';

/** A deterministic test picture: flat areas (long runs), gradients and noise (literals), per channel. */
function picture(w: number, h: number, seed = 1): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) & 255);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const band = Math.floor((x / w) * 4);
      if (band === 0) d.set([255, 255, 255], o);
      else if (band === 1) d.set([x & 255, y & 255, (x + y) & 255], o);
      else if (band === 2) d.set([rnd(), rnd(), rnd()], o);
      else d.set([181, 83, (x >> 3) & 1 ? 58 : 59], o);
      d[o + 3] = 255;
    }
  }
  return d;
}

/**
 * The encoder's worst case: a lone byte then a 2-byte repeat, over and over ("a b b c d d …"), which grows every
 * row by a third. Real paintings get close to this in noisy areas.
 */
function worstCase(w: number, h: number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const i = x * 3 + c; // byte index in the RGB row
        const group = Math.floor(i / 3);
        d[o + c] = i % 3 === 0 ? (group * 7 + y) & 255 : (group * 13 + 101 + y) & 255;
      }
      d[o + 3] = 255;
    }
  }
  return d;
}

function prototypeEncoder(w: number, h: number) {
  return evalPrototype<{ tiff: (cv: unknown) => Blob }>(
    `${prototypeSource('function packbits(', 'const fname=')}\nreturn { tiff };`,
    { W: w, H: h, Blob },
  );
}

const stubCanvas = (data: Uint8ClampedArray) => ({ getContext: () => ({ getImageData: () => ({ data }) }) });

function unpackBits(src: Uint8Array): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < src.length) {
    const n = src[i++];
    if (n < 128) {
      for (let k = 0; k <= n; k++) out.push(src[i++]);
    } else if (n > 128) {
      const v = src[i++];
      for (let k = 0; k < 257 - n; k++) out.push(v);
    }
  }
  return out;
}

describe('PackBits', () => {
  it('round-trips runs of every awkward length and literals', () => {
    const rows: number[][] = [
      [1],
      [1, 1],
      [1, 2],
      Array(128).fill(7),
      Array(129).fill(7),
      Array(300).fill(9),
      Array.from({ length: 300 }, (_, i) => i & 255),
      [...Array(5).fill(1), ...Array.from({ length: 140 }, (_, i) => (i * 7) & 255), 2, 2, 3],
    ];
    for (const r of rows) {
      const src = Uint8Array.from(r);
      const out = new Uint8Array(src.length * 2 + 2);
      const len = packBitsRow(src, src.length, out, 0);
      expect(unpackBits(out.subarray(0, len))).toEqual(r);
    }
  });
});

describe('TIFF encoder (acceptance #4)', () => {
  it('is byte-identical to the prototype encoder (small picture)', async () => {
    const [w, h] = [37, 23];
    const px = picture(w, h, 7);
    const expected = new Uint8Array(await prototypeEncoder(w, h).tiff(stubCanvas(px)).arrayBuffer());
    expect(encodeTiffRgb(px, w, h, 300)).toEqual(expected);
  });

  it('is byte-identical to the prototype encoder at 1287 × 1795', async () => {
    const [w, h] = [1287, 1795];
    const px = picture(w, h, 3);
    const expected = new Uint8Array(await prototypeEncoder(w, h).tiff(stubCanvas(px)).arrayBuffer());
    const actual = encodeTiffRgb(px, w, h, 300);
    expect(actual.length).toBe(expected.length);
    expect(Buffer.compare(Buffer.from(actual), Buffer.from(expected))).toBe(0);
  });

  it('survives the worst case (rows that grow by a third) at 1287 × 1795, byte-identical to the prototype', async () => {
    const [w, h] = [1287, 1795];
    const px = worstCase(w, h);
    const expected = new Uint8Array(await prototypeEncoder(w, h).tiff(stubCanvas(px)).arrayBuffer());
    const actual = encodeTiffRgb(px, w, h, 300);
    expect(actual.length).toBeGreaterThan(w * h * 3 * 1.3);
    expect(Buffer.compare(Buffer.from(actual), Buffer.from(expected))).toBe(0);
    const buf = actual.buffer.slice(actual.byteOffset, actual.byteOffset + actual.byteLength);
    const [ifd] = UTIF.decode(buf);
    UTIF.decodeImage(buf, ifd);
    expect(Buffer.compare(Buffer.from(UTIF.toRGBA8(ifd)), Buffer.from(px.buffer))).toBe(0);
  });

  it('decodes as 1287 × 1795 px, RGB 8-bit, PackBits, 300 dpi, with the same pixels', () => {
    const [w, h] = [1287, 1795];
    const px = picture(w, h, 5);
    const file = encodeTiffRgb(px, w, h, 300);
    const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    const [ifd] = UTIF.decode(buf);
    expect(ifd.t256).toEqual([w]);
    expect(ifd.t257).toEqual([h]);
    expect(ifd.t258).toEqual([8, 8, 8]);
    expect(ifd.t259).toEqual([32773]);
    expect(ifd.t262).toEqual([2]);
    expect(ifd.t277).toEqual([3]);
    expect(ifd.t282).toEqual([300]);
    expect(ifd.t283).toEqual([300]);
    expect(ifd.t296).toEqual([2]);
    UTIF.decodeImage(buf, ifd);
    const rgba = UTIF.toRGBA8(ifd);
    expect(Buffer.compare(Buffer.from(rgba), Buffer.from(px.buffer))).toBe(0);
  });
});
