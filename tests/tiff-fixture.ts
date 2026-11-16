import { deflateSync } from 'node:zlib';

/** TIFF LZW (MSB-first): literal codes only, with a Clear code often enough to stay at 9-bit width. */
export function lzw(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  const put = (code: number) => {
    acc = (acc << 9) | code;
    bits += 9;
    while (bits >= 8) {
      out.push((acc >>> (bits - 8)) & 255);
      bits -= 8;
    }
    acc &= (1 << bits) - 1;
  };
  put(256);
  let n = 0;
  for (const b of data) {
    if (n === 250) {
      put(256);
      n = 0;
    }
    put(b);
    n++;
  }
  put(257);
  if (bits > 0) out.push((acc << (8 - bits)) & 255);
  return Uint8Array.from(out);
}

export interface TiffSpec {
  w: number;
  h: number;
  /** Interleaved samples, `spp` per pixel, each 0 … 2^bits − 1. */
  samples: ArrayLike<number>;
  spp: number;
  photometric: number;
  bits?: 8 | 16;
  order?: 'II' | 'MM';
  compression?: 'none' | 'lzw' | 'deflate';
  /** Horizontal differencing (Predictor 2). */
  predictor?: boolean;
  rowsPerStrip?: number;
  /** Leaves the last strip out of the strip lists: the decoder then gets fewer rows than the height says. */
  dropLastStrip?: boolean;
  /** An embedded ICC profile (tag 34675). */
  icc?: Uint8Array;
  /** Puts the profile at an odd byte offset, as real files may. */
  iccOddOffset?: boolean;
  /** More tags: [tag, type (3 SHORT, 4 LONG), values]. */
  tags?: [number, 3 | 4, number[]][];
}

interface Entry {
  tag: number;
  type: 3 | 4 | 7;
  values: ArrayLike<number>;
  /** Where its values go when they don't fit in the entry. */
  at?: number;
}

const SIZE = { 3: 2, 4: 4, 7: 1 } as const;

/** Writes a baseline TIFF for the tests: any byte order, 8/16-bit, three compressions, strips, a profile. */
export function writeTiff(s: TiffSpec): Buffer {
  const bits = s.bits ?? 8;
  const bytes = bits / 8;
  const le = (s.order ?? 'II') === 'II';
  const rps = Math.min(s.rowsPerStrip ?? s.h, s.h);
  const rowSamples = s.w * s.spp;
  const mask = bits === 16 ? 0xffff : 0xff;

  const strips: Uint8Array[] = [];
  for (let y0 = 0; y0 < s.h; y0 += rps) {
    const rows = Math.min(rps, s.h - y0);
    const raw = new Uint8Array(rows * rowSamples * bytes);
    const dv = new DataView(raw.buffer);
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < rowSamples; i++) {
        const at = (y0 + r) * rowSamples + i;
        const v = (s.predictor && i >= s.spp ? s.samples[at] - s.samples[at - s.spp] : s.samples[at]) & mask;
        const o = (r * rowSamples + i) * bytes;
        if (bytes === 1) raw[o] = v;
        else dv.setUint16(o, v, le);
      }
    }
    const packed = s.compression === 'lzw' ? lzw(raw) : s.compression === 'deflate' ? deflateSync(raw) : raw;
    strips.push(new Uint8Array(packed));
  }
  const listed = s.dropLastStrip ? strips.slice(0, -1) : strips;

  const entry = (tag: number, type: Entry['type'], values: ArrayLike<number>): Entry => ({ tag, type, values });
  const entries: Entry[] = [
    entry(256, 3, [s.w]),
    entry(257, 3, [s.h]),
    entry(258, 3, Array(s.spp).fill(bits)),
    entry(259, 3, [{ none: 1, lzw: 5, deflate: 8 }[s.compression ?? 'none']]),
    entry(262, 3, [s.photometric]),
    entry(273, 4, listed.map(() => 0)),
    entry(277, 3, [s.spp]),
    entry(278, 3, [rps]),
    entry(279, 4, listed.map((d) => d.length)),
    ...(s.predictor ? [entry(317, 3, [2])] : []),
    ...(s.tags ?? []).map(([tag, type, values]) => entry(tag, type, values)),
    ...(s.icc ? [entry(34675, 7, s.icc)] : []),
  ].sort((a, b) => a.tag - b.tag);

  // Layout: header, the IFD, the values that don't fit in their entries, then the strips.
  let end = 8 + 2 + entries.length * 12 + 4;
  for (const e of entries) {
    const len = e.values.length * SIZE[e.type];
    if (len <= 4) continue;
    end += end & 1;
    if (e.tag === 34675 && s.iccOddOffset) end += 1;
    e.at = end;
    end += len;
  }
  end += end & 1;
  const stripAt: number[] = [];
  for (const d of listed) {
    stripAt.push(end);
    end += d.length;
  }

  const buf = Buffer.alloc(end);
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  buf.write(le ? 'II' : 'MM', 0, 'latin1');
  v.setUint16(2, 42, le);
  v.setUint32(4, 8, le);
  v.setUint16(8, entries.length, le);
  const put = (type: 3 | 4 | 7, o: number, x: number) => {
    if (type === 3) v.setUint16(o, x, le);
    else if (type === 4) v.setUint32(o, x, le);
    else buf[o] = x;
  };
  entries.forEach((e, i) => {
    const o = 10 + i * 12;
    const values = e.tag === 273 ? stripAt : e.values;
    v.setUint16(o, e.tag, le);
    v.setUint16(o + 2, e.type, le);
    v.setUint32(o + 4, values.length, le);
    const base = e.at ?? o + 8;
    if (e.at !== undefined) v.setUint32(o + 8, e.at, le);
    for (let k = 0; k < values.length; k++) put(e.type, base + k * SIZE[e.type], values[k]);
  });
  listed.forEach((d, i) => buf.set(d, stripAt[i]));
  return buf;
}

/** The buffer `UTIF.decode` takes: exactly the file's bytes. */
export const arrayBuffer = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
