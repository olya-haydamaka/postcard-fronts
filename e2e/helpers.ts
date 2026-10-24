import { readFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { expect, type Download, type Page } from '@playwright/test';
import UTIF from 'utif';
import { encodeTiffRgb } from '../src/io/tiff-encode';

/**
 * WebKit's own <select> builds its shadow tree with an inline stylesheet, which a strict style-src refuses. A bare
 * <select> on an empty page with the same CSP logs it too, so it is the engine's message, not the app's.
 */
const WEBKIT_SELECT_CSP = /^Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline'/;

/** Fails the test on any console error or uncaught exception (a CSP violation is a console error). */
export function watchErrors(page: Page, browserName: string): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (browserName === 'webkit' && WEBKIT_SELECT_CSP.test(m.text())) return;
    errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

export interface ImageSpec {
  name: string;
  w: number;
  h: number;
  /** CSS colour of the flat fill. */
  color: string;
  type?: 'image/jpeg' | 'image/png';
}

/**
 * Generates pictures inside the page and hands them to the header's file input, as a user pick would.
 * Generating in the page avoids shipping large buffers between Node and the browser.
 */
export async function addGeneratedImages(page: Page, specs: ImageSpec[]): Promise<void> {
  await page.evaluate(async (list) => {
    const dt = new DataTransfer();
    for (const s of list) {
      // A plain canvas: some WebKit builds have no OffscreenCanvas.
      const canvas = document.createElement('canvas');
      canvas.width = s.w;
      canvas.height = s.h;
      const c = canvas.getContext('2d')!;
      c.fillStyle = s.color;
      c.fillRect(0, 0, s.w, s.h);
      // A darker band across the top fifth, so placement is visible.
      c.fillStyle = 'rgba(0,0,0,.35)';
      c.fillRect(0, 0, s.w, Math.round(s.h / 5));
      const type = s.type ?? 'image/jpeg';
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), type, 0.92),
      );
      dt.items.add(new File([blob], s.name, { type }));
    }
    const input = document.getElementById('files') as HTMLInputElement;
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, specs);
}

export const toast = (page: Page) => page.locator('#toast');

/** Collects the next `n` downloads. */
export async function nextDownloads(page: Page, n: number, action: () => Promise<void>): Promise<Download[]> {
  const got: Download[] = [];
  const listener = (d: Download) => got.push(d);
  page.on('download', listener);
  await action();
  await expect.poll(() => got.length, { timeout: 30_000 }).toBe(n);
  page.off('download', listener);
  return got;
}

export interface DecodedTiff {
  ifd: Record<string, unknown>;
  w: number;
  h: number;
  rgba: Uint8Array;
}

export async function decodeDownload(d: Download): Promise<DecodedTiff> {
  const file = await readFile(await d.path());
  const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const [ifd] = UTIF.decode(buf);
  UTIF.decodeImage(buf, ifd);
  return { ifd, w: ifd.width ?? 0, h: ifd.height ?? 0, rgba: UTIF.toRGBA8(ifd) };
}

export function pixel(t: DecodedTiff, x: number, y: number): [number, number, number] {
  const o = (y * t.w + x) * 4;
  return [t.rgba[o], t.rgba[o + 1], t.rgba[o + 2]];
}

export function expectColor(actual: [number, number, number], expected: [number, number, number], tolerance = 6) {
  actual.forEach((v, i) => expect(Math.abs(v - expected[i]), `channel ${i}: ${actual} vs ${expected}`).toBeLessThanOrEqual(tolerance));
}

// ── TIFF fixtures in three compressions ───────────────────────────────────────────────────────────────────────

/** RGB test picture: top half `top`, bottom half `bottom`. */
export function twoTone(w: number, h: number, top: [number, number, number], bottom: [number, number, number]) {
  const rgb = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rgb.set(y < h / 2 ? top : bottom, (y * w + x) * 3);
  return rgb;
}

/** TIFF LZW (MSB-first): literal codes only, with a Clear code often enough to stay at 9-bit width. */
function lzw(data: Uint8Array): Uint8Array {
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

export function tiffFixture(w: number, h: number, rgb: Uint8Array, compression: 'packbits' | 'lzw' | 'deflate'): Buffer {
  if (compression === 'packbits') {
    const rgba = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) rgba.set([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2], 255], i * 4);
    return Buffer.from(encodeTiffRgb(rgba, w, h, 300));
  }
  const body = compression === 'lzw' ? lzw(rgb) : new Uint8Array(deflateSync(rgb));
  const code = compression === 'lzw' ? 5 : 8;
  const tags: [number, number, number, number?][] = [
    [256, 3, w],
    [257, 3, h],
    [258, 3, 0, 3],
    [259, 3, code],
    [262, 3, 2],
    [273, 4, 0],
    [277, 3, 3],
    [278, 3, h],
    [279, 4, body.length],
  ];
  const ifd = 8;
  const bps = ifd + 2 + tags.length * 12 + 4;
  const data = bps + 6;
  const buf = Buffer.alloc(data + body.length);
  buf.write('II', 0, 'latin1');
  buf.writeUInt16LE(42, 2);
  buf.writeUInt32LE(ifd, 4);
  buf.writeUInt16LE(tags.length, ifd);
  tags.forEach(([tag, type, value, count], i) => {
    const o = ifd + 2 + i * 12;
    const v = tag === 258 ? bps : tag === 273 ? data : value;
    buf.writeUInt16LE(tag, o);
    buf.writeUInt16LE(type, o + 2);
    buf.writeUInt32LE(count ?? 1, o + 4);
    if (type === 3 && !count) buf.writeUInt16LE(v, o + 8);
    else buf.writeUInt32LE(v, o + 8);
  });
  for (let i = 0; i < 3; i++) buf.writeUInt16LE(8, bps + i * 2);
  buf.set(body, data);
  return buf;
}
