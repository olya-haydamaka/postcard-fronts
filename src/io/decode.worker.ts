import { downscale } from './downscale';
import { tiffPixels } from './tiff-pixels';

export interface DecodeRequest {
  id: number;
  buf: ArrayBuffer;
  /** Long-side limit for a preview; null = full resolution (export). */
  maxSide: number | null;
}

export type DecodeResponse =
  | { id: number; ok: true; bitmap: ImageBitmap; iw: number; ih: number }
  | { id: number; ok: false; error: string };

/** TIFF decoding runs here so a 40 MP file never freezes the page. */
self.onmessage = async (e: MessageEvent<DecodeRequest>) => {
  const { id, buf, maxSide } = e.data;
  try {
    const { rgba, w, h } = tiffPixels(buf);
    const full = await createImageBitmap(new ImageData(rgba, w, h));
    const bitmap = maxSide ? await downscale(full, maxSide) : full;
    const msg: DecodeResponse = { id, ok: true, bitmap, iw: w, ih: h };
    self.postMessage(msg, { transfer: [bitmap] });
  } catch (err) {
    const msg: DecodeResponse = { id, ok: false, error: String(err) };
    self.postMessage(msg);
  }
};
