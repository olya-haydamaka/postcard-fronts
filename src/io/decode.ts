import type { DecodeRequest, DecodeResponse } from './decode.worker';
import { downscale } from './downscale';

/** Preview long side, px: enough for the stage at 6 px/mm on a 2× display. */
export const PREVIEW_MAX_SIDE = 2400;

export const isImageFile = (f: File): boolean => /^image\//.test(f.type) || /\.(tiff?|jpe?g|png|webp)$/i.test(f.name);

/** The MIME type of a TIFF is often empty, so the extension counts too. */
export const isTiffFile = (f: File): boolean => /tiff/.test(f.type) || /\.tiff?$/i.test(f.name);

export interface Decoded {
  bitmap: ImageBitmap;
  /** Original pixel size. */
  iw: number;
  ih: number;
}

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (d: Decoded) => void; reject: (e: Error) => void }>();

function tiffWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./decode.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e: MessageEvent<DecodeResponse>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.ok) p.resolve({ bitmap: e.data.bitmap, iw: e.data.iw, ih: e.data.ih });
    else p.reject(new Error(e.data.error));
  };
  w.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || 'TIFF worker failed'));
    pending.clear();
    w.terminate();
    worker = null;
  };
  worker = w;
  return w;
}

async function decodeTiff(file: File, maxSide: number | null): Promise<Decoded> {
  const buf = await file.arrayBuffer();
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const req: DecodeRequest = { id, buf, maxSide };
    tiffWorker().postMessage(req, [buf]);
  });
}

/** For a slot: a downscaled preview plus the original size. */
export async function decodePreview(file: File): Promise<Decoded> {
  if (isTiffFile(file)) return decodeTiff(file, PREVIEW_MAX_SIDE);
  const full = await createImageBitmap(file);
  const { width: iw, height: ih } = full;
  return { bitmap: await downscale(full, PREVIEW_MAX_SIDE), iw, ih };
}

/** For export: the file at full resolution, decoded the same way as the prototype did. Throws if unreadable. */
export async function decodeFull(file: File): Promise<Decoded> {
  if (isTiffFile(file)) return decodeTiff(file, null);
  const bitmap = await createImageBitmap(file);
  return { bitmap, iw: bitmap.width, ih: bitmap.height };
}
