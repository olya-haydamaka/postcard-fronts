import { preset } from '../config/preset';
import { toManual } from '../geometry/fit';
import { guides, snapAxis } from '../geometry/snap';
import { clampZoom, stageScale, stepZoom, wheelZoomFactor, ZOOM_MAX, ZOOM_MIN } from '../geometry/stage';
import { drawBackG } from '../render/back-g';
import { backdropAt, type Pixels } from '../render/contrast';
import { drawFront, drawGhostPicture } from '../render/front';
import { drawOverlays } from '../render/overlays';
import { layout, marginLine, rectOf, S, type Slot } from '../state/store';
import { byId, canvasRatio, sizeCanvas } from './dom';

const f = preset.format;

/**
 * A small copy of each picture's pixels (≤ 600 px), read once: the guide lines check what they cross against it.
 * Reading the stage canvas instead would mean a GPU readback on every frame of a drag or a zoom.
 */
const probes = new WeakMap<ImageBitmap, Pixels>();
const PROBE_PX = 600;

function probe(bmp: ImageBitmap): Pixels | undefined {
  let p = probes.get(bmp);
  if (p) return p;
  const s = Math.min(1, PROBE_PX / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(bmp.width * s));
  cv.height = Math.max(1, Math.round(bmp.height * s));
  const c = cv.getContext('2d', { willReadFrequently: true });
  if (!c) return undefined;
  c.drawImage(bmp, 0, 0, cv.width, cv.height);
  p = c.getImageData(0, 0, cv.width, cv.height);
  probes.set(bmp, p);
  return p;
}

function drawGhost(sl: Slot, k: number): void {
  const g = byId<HTMLCanvasElement>('ghost');
  const gp = f.ghostPadMm;
  const gw = (f.widthMm + 2 * gp) * k;
  const gh = (f.heightMm + 2 * gp) * k;
  // Blurred anyway, so it never needs many pixels, however far the view is zoomed.
  const r = canvasRatio(gw, gh, 2e6);
  g.width = Math.round(gw * r);
  g.height = Math.round(gh * r);
  g.style.width = `${gw}px`;
  g.style.height = `${gh}px`;
  g.style.left = g.style.top = `${-gp * k}px`;
  byId('fw').style.margin = `${gp * k}px`;
  const c = g.getContext('2d');
  if (!c) return;
  c.setTransform(r, 0, 0, r, 0, 0);
  c.clearRect(0, 0, gw, gh);
  c.translate(gp * k, gp * k);
  drawGhostPicture(c, sl.preview, rectOf(sl), k);
}

/** The zoom controls, and whether the view has anything to pan to. */
function renderZoom(): void {
  byId('zVal').textContent = `${Math.round(S.zoom * 100)}%`;
  byId<HTMLButtonElement>('zOut').disabled = S.zoom <= ZOOM_MIN;
  byId<HTMLButtonElement>('zIn').disabled = S.zoom >= ZOOM_MAX;
  byId<HTMLButtonElement>('zFit').disabled = S.zoom === 1;
  const view = byId('view');
  view.classList.toggle('pan', view.scrollWidth > view.clientWidth + 1 || view.scrollHeight > view.clientHeight + 1);
}

/**
 * No cards yet: a blank card with its bleed and trim, the drop zone's words and the sample button on it. Sized like
 * the prototype's: the largest that fits the stage with 40 px around, between 1.6 and 4.2 px per mm.
 */
function drawEmptyCard(): void {
  const stage = byId('stage');
  const fit = Math.min((stage.clientWidth - 80) / f.widthMm, (stage.clientHeight - 80) / f.heightMm);
  const k = Math.max(1.6, Math.min(fit, 4.2));
  const c = sizeCanvas(byId<HTMLCanvasElement>('emptyCard'), f.widthMm, f.heightMm, k);
  c.fillStyle = '#fff';
  c.fillRect(0, 0, f.widthMm * k, f.heightMm * k);
  // Whatever the Show switches say: the empty card shows what bleed and trim mean.
  drawOverlays(c, k, f, {
    bleed: S.bleed,
    margin: marginLine(),
    ov: { bleed: true, trim: true, safe: false, back: false },
    snap: null,
  });
}

export function renderStage(): void {
  const sl = S.cur;
  const stage = byId('stage');
  stage.classList.toggle('none', !sl);
  if (!sl) {
    drawEmptyCard();
    return;
  }
  // Measured on the view's frame, which never has scrollbars, so 100 % stays the same size once zoomed in.
  const frame = byId('viewport');
  const pad = getComputedStyle(byId('view'));
  const caption = byId('frontCap');
  const fit = stageScale({
    // 1 px to spare, so rounding never makes the fitted cards scroll.
    viewWidth: frame.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight) - 1,
    viewHeight: frame.clientHeight - parseFloat(pad.paddingTop) - parseFloat(pad.paddingBottom) - 1,
    captionHeight: caption.offsetHeight + parseFloat(getComputedStyle(caption.parentElement!).rowGap),
    showBack: S.ov.back,
    cardWidthMm: f.widthMm,
    cardHeightMm: f.heightMm,
    ghostPadMm: f.ghostPadMm,
  });
  S.k = fit * S.zoom;
  const k = S.k;
  // Zoomed in, the view gets room to scroll on every side, so a wheel zoom keeps the point under the cursor in place
  // even while the cards would still fit across. At 100 % and below they sit centred.
  byId('cards').style.margin = S.zoom > 1 ? `${frame.clientHeight / 2}px ${frame.clientWidth / 2}px` : '';
  drawGhost(sl, k);

  const fc = sizeCanvas(byId<HTMLCanvasElement>('front'), f.widthMm, f.heightMm, k);
  const r = rectOf(sl);
  drawFront(fc, sl.preview, r, k, f);
  const px = probe(sl.preview);
  drawOverlays(fc, k, f, {
    bleed: S.bleed,
    margin: marginLine(),
    ov: S.ov,
    snap: S.snap,
    backdrop: px && ((x, y) => backdropAt(px, r, x, y)),
  });

  const backW = byId('backW');
  backW.hidden = !S.ov.back;
  if (S.ov.back) {
    const back = byId<HTMLCanvasElement>('back');
    // The front card sits inside the blurred surround's padding; the back drops by as much, so the tops line up.
    back.style.marginTop = `${f.ghostPadMm * k}px`;
    const bc = sizeCanvas(back, f.widthMm, f.heightMm, k);
    drawBackG(bc, sl.t, k, S.back, f);
    drawOverlays(bc, k, f, { bleed: S.bleed, margin: marginLine(), ov: S.ov, snap: null });
  }
  renderZoom();
}

/** Zooms the view to `z`, keeping the point under `at` (the cursor; the view's centre by default) where it is. */
function zoomTo(z: number, at?: { x: number; y: number }): void {
  const next = clampZoom(z);
  if (!S.cur || next === S.zoom) return;
  const view = byId('view');
  const box = view.getBoundingClientRect();
  const x = at?.x ?? box.left + view.clientWidth / 2;
  const y = at?.y ?? box.top + view.clientHeight / 2;
  const before = byId('front').getBoundingClientRect();
  const u = (x - before.left) / S.k;
  const v = (y - before.top) / S.k;
  S.zoom = next;
  renderStage();
  const after = byId('front').getBoundingClientRect();
  view.scrollLeft += after.left + u * S.k - x;
  view.scrollTop += after.top + v * S.k - y;
}

/** A wheel gesture keeps the job it started with until the wheel rests this long, ms. */
const WHEEL_REST_MS = 400;

/**
 * The view and the card share the wheel. Over the card it scales the picture; beside the card it zooms the view
 * around the cursor. A gesture keeps the job it started with until the wheel rests: zooming in grows the card under
 * the cursor, and the next notch must not start scaling the picture. A drag beside the card pans the zoomed view;
 * the controls in its corner zoom in steps or back to fit.
 */
function bindView(front: HTMLCanvasElement, scalePicture: (sl: Slot, deltaY: number) => void): void {
  const view = byId('view');
  let gesture: { job: 'picture' | 'view'; at: number } | null = null;
  let wheel: { f: number; x: number; y: number } | null = null;
  view.addEventListener(
    'wheel',
    (e) => {
      const sl = S.cur;
      if (!sl) return;
      const going = gesture && e.timeStamp - gesture.at < WHEEL_REST_MS;
      const job = going ? gesture!.job : front.contains(e.target as Node) ? 'picture' : 'view';
      // Beside the card, Ctrl + wheel (and a trackpad pinch) zooms the page as everywhere, and a sideways swipe
      // scrolls the view.
      if (job === 'view' && (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY))) return;
      gesture = { job, at: e.timeStamp };
      e.preventDefault();
      if (job === 'picture') {
        scalePicture(sl, e.deltaY);
        return;
      }
      const px = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? view.clientHeight : 1);
      const factor = wheelZoomFactor(px);
      // One render per frame, however many wheel events a trackpad sends.
      if (wheel) {
        wheel = { f: wheel.f * factor, x: e.clientX, y: e.clientY };
        return;
      }
      wheel = { f: factor, x: e.clientX, y: e.clientY };
      requestAnimationFrame(() => {
        const w = wheel!;
        wheel = null;
        zoomTo(S.zoom * w.f, w);
      });
    },
    { passive: false },
  );

  let pan: { x: number; y: number; left: number; top: number } | null = null;
  view.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.pointerType === 'touch' || !view.classList.contains('pan')) return;
    if (front.contains(e.target as Node)) return;
    // A press on the view's own scrollbar.
    if (e.target === view && (e.offsetX >= view.clientWidth || e.offsetY >= view.clientHeight)) return;
    pan = { x: e.clientX, y: e.clientY, left: view.scrollLeft, top: view.scrollTop };
    view.setPointerCapture(e.pointerId);
    view.classList.add('panning');
  });
  view.addEventListener('pointermove', (e) => {
    if (!pan) return;
    view.scrollLeft = pan.left - (e.clientX - pan.x);
    view.scrollTop = pan.top - (e.clientY - pan.y);
  });
  const endPan = () => {
    pan = null;
    view.classList.remove('panning');
  };
  view.addEventListener('pointerup', endPan);
  view.addEventListener('pointercancel', endPan);

  byId('zIn').addEventListener('click', () => zoomTo(stepZoom(S.zoom, 1)));
  byId('zOut').addEventListener('click', () => zoomTo(stepZoom(S.zoom, -1)));
  byId('zFit').addEventListener('click', () => zoomTo(1));
}

/**
 * Drag (with snapping), double-click to centre horizontally, wheel to scale (see bindView). `changed` re-renders the
 * card.
 */
export function bindStage(changed: (sl: Slot) => void): void {
  const front = byId<HTMLCanvasElement>('front');
  bindView(front, (sl, deltaY) => {
    toManual(sl, sl, layout());
    const d = Math.max(-60, Math.min(60, deltaY));
    sl.s = Math.max(0.2, Math.min(3, sl.s * Math.exp(-d * 0.0004)));
    changed(sl);
  });
  let drag: { sl: Slot; x: number; y: number; dx: number; dy: number } | null = null;

  front.addEventListener('pointerdown', (e) => {
    const sl = S.cur;
    if (!sl) return;
    toManual(sl, sl, layout());
    drag = { sl, x: e.clientX, y: e.clientY, dx: sl.dx, dy: sl.dy };
    front.setPointerCapture(e.pointerId);
    front.classList.add('drag');
  });

  front.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const sl = drag.sl;
    sl.dx = drag.dx + (e.clientX - drag.x) / S.k;
    sl.dy = drag.dy + (e.clientY - drag.y) / S.k;
    S.snap = null;
    if (!e.altKey) {
      const r = rectOf(sl);
      const sx = snapAxis(r.x, r.w, f.widthMm, guides(f.widthMm, S.bleed, marginLine(), f.safeMm));
      const sy = snapAxis(r.y, r.h, f.heightMm, guides(f.heightMm, S.bleed, marginLine(), f.safeMm));
      if (sx) sl.dx += sx.d;
      if (sy) sl.dy += sy.d;
      S.snap = { x: sx ? sx.t : null, y: sy ? sy.t : null };
    }
    changed(sl);
  });

  const end = () => {
    const sl = drag?.sl;
    drag = null;
    S.snap = null;
    front.classList.remove('drag');
    // A press alone also turned the card manual, so the panel must follow.
    if (sl) changed(sl);
    else renderStage();
  };
  front.addEventListener('pointerup', end);
  front.addEventListener('pointercancel', end);

  front.addEventListener('dblclick', () => {
    const sl = S.cur;
    if (!sl) return;
    toManual(sl, sl, layout());
    sl.dx = 0;
    changed(sl);
  });
}
