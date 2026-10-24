/** Draws `bmp` at w × h on whatever canvas this context has; null when it has none (a worker without OffscreenCanvas). */
async function canvasResize(bmp: ImageBitmap, w: number, h: number): Promise<ImageBitmap | null> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h);
    const c = canvas.getContext('2d');
    if (!c) return null;
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(bmp, 0, 0, w, h);
    return canvas.transferToImageBitmap();
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const c = canvas.getContext('2d');
    if (!c) return null;
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(bmp, 0, 0, w, h);
    return createImageBitmap(canvas);
  }
  return null;
}

/**
 * Returns a bitmap whose long side is at most `maxSide`, closing the input when it makes a new one.
 * Works on the main thread and in workers; if nothing can resize, the input comes back unchanged.
 */
export async function downscale(bmp: ImageBitmap, maxSide: number): Promise<ImageBitmap> {
  const s = maxSide / Math.max(bmp.width, bmp.height);
  if (s >= 1) return bmp;
  const w = Math.max(1, Math.round(bmp.width * s));
  const h = Math.max(1, Math.round(bmp.height * s));
  let out: ImageBitmap | null;
  try {
    out = await createImageBitmap(bmp, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
  } catch {
    out = null;
  }
  // Some engines ignore the resize options; fall back to a canvas.
  if (!out || out.width !== w || out.height !== h) {
    out?.close();
    out = await canvasResize(bmp, w, h);
  }
  if (!out) return bmp;
  bmp.close();
  return out;
}
