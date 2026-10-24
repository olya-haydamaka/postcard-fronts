/**
 * Dependency-free baseline TIFF writer: RGB, 8 bits per sample, PackBits (32773), one strip,
 * X/YResolution = dpi/1, ResolutionUnit = inch. Output is byte-identical to the design prototype's encoder.
 */

/** PackBits-encodes `n` bytes of `src` into `out` at offset `o`; returns the new offset. */
export function packBitsRow(src: Uint8Array, n: number, out: Uint8Array, o: number): number {
  let i = 0;
  while (i < n) {
    let j = i;
    while (j < n - 1 && j - i < 127 && src[j] === src[j + 1]) j++;
    if (j > i) {
      // Run of (j - i + 1) equal bytes: header 257 - count as a signed byte, then the byte.
      out[o++] = (257 - (j - i + 1)) & 255;
      out[o++] = src[i];
      i = j + 1;
    } else {
      // Literal run of up to 128 bytes that don't start a repeat.
      const s = i;
      while (i < n && i - s < 128 && !(i < n - 1 && src[i] === src[i + 1])) i++;
      out[o++] = i - s - 1;
      for (let k = s; k < i; k++) out[o++] = src[k];
    }
  }
  return o;
}

const SHORT = 3;
const LONG = 4;
const RATIONAL = 5;

/** Encodes RGBA pixels (alpha dropped) as a TIFF file. */
export function encodeTiffRgb(
  rgba: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
  dpi: number,
): Uint8Array<ArrayBuffer> {
  const rowBytes = w * 3;
  const row = new Uint8Array(rowBytes);
  // A row can grow: 2-byte repeats are written as runs, so "a b b c d d …" takes 4 bytes per 3, and a lone byte 2.
  // Typed arrays drop writes past their end silently, so keep room for the worst case (2 bytes per byte) per row.
  const rowMax = 2 * rowBytes;
  let body = new Uint8Array(rowBytes * h + rowMax);
  let len = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      row[x * 3] = rgba[s];
      row[x * 3 + 1] = rgba[s + 1];
      row[x * 3 + 2] = rgba[s + 2];
    }
    if (body.length - len < rowMax) {
      const grown = new Uint8Array(Math.max(body.length * 1.5, len + rowMax * 2) | 0);
      grown.set(body.subarray(0, len));
      body = grown;
    }
    len = packBitsRow(row, rowBytes, body, len);
  }

  // [tag, type, value, count?] in ascending tag order. Offsets (0 here) are filled in below.
  const tags: [number, number, number, number?][] = [
    [256, SHORT, w], // ImageWidth
    [257, SHORT, h], // ImageLength
    [258, SHORT, 0, 3], // BitsPerSample → offset
    [259, SHORT, 32773], // Compression: PackBits
    [262, SHORT, 2], // PhotometricInterpretation: RGB
    [273, LONG, 0], // StripOffsets → offset
    [277, SHORT, 3], // SamplesPerPixel
    [278, SHORT, h], // RowsPerStrip
    [279, LONG, len], // StripByteCounts
    [282, RATIONAL, 0], // XResolution → offset
    [283, RATIONAL, 0], // YResolution → offset
    [296, SHORT, 2], // ResolutionUnit: inch
  ];
  const ifd = 8;
  const ifdSize = 2 + tags.length * 12 + 4;
  const bpsAt = ifd + ifdSize;
  const resAt = bpsAt + 6;
  const dataAt = resAt + 16;

  const buf = new ArrayBuffer(dataAt + len);
  const v = new DataView(buf);
  v.setUint16(0, 0x4949, true); // "II": little-endian
  v.setUint16(2, 42, true);
  v.setUint32(4, ifd, true);
  v.setUint16(ifd, tags.length, true);
  tags.forEach(([tag, type, value, count], i) => {
    const o = ifd + 2 + i * 12;
    let val = value;
    if (tag === 258) val = bpsAt;
    if (tag === 273) val = dataAt;
    if (tag === 282) val = resAt;
    if (tag === 283) val = resAt + 8;
    v.setUint16(o, tag, true);
    v.setUint16(o + 2, type, true);
    v.setUint32(o + 4, count ?? 1, true);
    if (type === SHORT && !count) v.setUint16(o + 8, val, true);
    else v.setUint32(o + 8, val, true);
  });
  for (let i = 0; i < 3; i++) v.setUint16(bpsAt + i * 2, 8, true);
  [dpi, 1, dpi, 1].forEach((x, i) => v.setUint32(resAt + i * 4, x, true));

  const out = new Uint8Array(buf);
  out.set(body.subarray(0, len), dataAt);
  return out;
}
