import UTIF, { type IFD } from 'utif';
import { downscale } from './downscale';

export interface DecodeRequest {
  id: number;
  buf: ArrayBuffer;
  /** Long-side limit for a preview; null = full resolution (export). */
  maxSide: number | null;
}

export type DecodeResponse =
  | { id: number; ok: true; bitmap: ImageBitmap; iw: number; ih: number }
  | { id: number; ok: false; error: string };

const area = (d: IFD): number => (d.t256?.[0] ?? d.width ?? 0) * (d.t257?.[0] ?? d.height ?? 0);

/** TIFF decoding runs here so a 40 MP file never freezes the page. */
self.onmessage = async (e: MessageEvent<DecodeRequest>) => {
  const { id, buf, maxSide } = e.data;
  try {
    const ifds = UTIF.decode(buf);
    if (!ifds.length) throw new Error('no image in TIFF');
    let p = ifds[0];
    for (const d of ifds) if (area(d) > area(p)) p = d;
    UTIF.decodeImage(buf, p, ifds);
    const w = p.width ?? 0;
    const h = p.height ?? 0;
    if (!w || !h) throw new Error('TIFF without size');
    const rgba = UTIF.toRGBA8(p);
    const full = await createImageBitmap(new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, w * h * 4), w, h));
    const bitmap = maxSide ? await downscale(full, maxSide) : full;
    const msg: DecodeResponse = { id, ok: true, bitmap, iw: w, ih: h };
    self.postMessage(msg, { transfer: [bitmap] });
  } catch (err) {
    const msg: DecodeResponse = { id, ok: false, error: String(err) };
    self.postMessage(msg);
  }
};
