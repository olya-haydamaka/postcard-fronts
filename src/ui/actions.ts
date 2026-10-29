import { outputPx, pxPerMm } from '../config/format';
import { preset, type BackText } from '../config/preset';
import { effectiveDpi, type Rect } from '../geometry/fit';
import { t } from '../i18n';
import { decodeFull, decodePreview, isImageFile, type Decoded } from '../io/decode';
import { download } from '../io/download';
import { cardLabel, exportFileName } from '../io/filename';
import { encodeTiffRgb } from '../io/tiff-encode';
import { drawBackG, loadBackFonts } from '../render/back-g';
import { drawFront } from '../render/front';
import { drawSample, SAMPLE_PX } from '../render/sample';
import { readCards } from '../state/saved';
import {
  addPicture,
  busy,
  parseSavedCard,
  rectOf,
  removeSlot,
  restoreSlot,
  S,
  savedCurrentId,
  setPicture,
  type Slot,
} from '../state/store';
import { holdSaves, saveSoon } from './autosave';
import { byId, wait } from './dom';
import { renderPanel } from './panel';
import { renderList, renderThumb } from './slot-list';
import { toast } from './toast';
import { refreshList, update } from './view';

const f = preset.format;
const OUT = outputPx(f);
const PX_PER_MM = pxPerMm(f);

// ── Loading: one file at a time, batches in order ──────────────────────────────────────────────────────────

let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.catch(() => undefined);
  return run;
}

async function decode(file: File): Promise<Decoded | null> {
  try {
    return await decodePreview(file);
  } catch (err) {
    console.error(err);
    return null;
  }
}

/**
 * Each picture becomes a card titled after its file name and listed by its leading number; the same name again
 * replaces that card's picture. The first of the batch in list order becomes current. Reports the counts.
 */
export function addFiles(files: Iterable<File>): Promise<void> {
  const list = [...files].filter(isImageFile);
  if (!list.length) return Promise.resolve();
  return enqueue(async () => {
    let added = 0;
    let replaced = 0;
    const touched = new Set<Slot>();
    const failed: string[] = [];
    for (const file of list) {
      const d = await decode(file);
      if (!d) {
        failed.push(file.name);
        continue;
      }
      const r = addPicture(file, d.bitmap, d.iw, d.ih);
      if (r.replaced) replaced++;
      else added++;
      touched.add(r.slot);
      renderList();
      // A new card got its thumbnail from renderList; a replaced one keeps its row and needs a redraw.
      if (r.replaced) renderThumb(r.slot);
    }
    const first = S.slots.find((s) => touched.has(s));
    if (first) S.cur = first;
    refreshList();
    const summary = [t('added', added, replaced), failed.length ? t('cantRead', failed.join(', ')) : '']
      .filter(Boolean)
      .join(' · ');
    if (summary) toast(summary);
  });
}

/**
 * «Try with a sample» (src/render/sample.ts): the drawn picture becomes card 01, tagged as the sample, selected, and
 * left out of Export all. The button is on the empty card, so the list is empty when it runs.
 */
export function addSample(): Promise<void> {
  return enqueue(async () => {
    const cv = document.createElement('canvas');
    cv.width = SAMPLE_PX.w;
    cv.height = SAMPLE_PX.h;
    const c = cv.getContext('2d');
    if (!c) return;
    drawSample(c, cv.width, cv.height);
    const blob = await new Promise<Blob | null>((done) => cv.toBlob(done, 'image/jpeg', 0.9));
    cv.width = cv.height = 0;
    const file = blob && new File([blob], `01 ${t('sampleTag')}.jpg`, { type: 'image/jpeg' });
    const d = file && (await decode(file));
    if (!file || !d) {
      toast(t('cantRead', t('sampleTag')));
      return;
    }
    const { slot } = addPicture(file, d.bitmap, d.iw, d.ih);
    slot.sample = true;
    S.cur = slot;
    refreshList();
  });
}

/**
 * A new picture for one card (Replace, or a file dropped on its row): its number and title stay. The sample makes way
 * instead: the picture becomes a card of its own, named after its file.
 */
function replacePicture(sl: Slot, file: File, andSelect: boolean): Promise<void> {
  return enqueue(async () => {
    const d = await decode(file);
    if (!d) {
      toast(t('cantRead', file.name));
      return;
    }
    // Removed while the file was being read.
    if (!S.slots.includes(sl)) {
      d.bitmap.close();
      return;
    }
    if (sl.sample) {
      removeSlot(sl);
      S.cur = addPicture(file, d.bitmap, d.iw, d.ih).slot;
      refreshList();
      return;
    }
    setPicture(sl, file, d.bitmap, d.iw, d.ih);
    if (andSelect) S.cur = sl;
    update(sl);
  });
}

export const dropOnSlot = (sl: Slot, file: File): Promise<void> => replacePicture(sl, file, true);

export function replaceCurrent(file: File): Promise<void> {
  return S.cur ? replacePicture(S.cur, file, false) : Promise.resolve();
}

export function removeCurrent(): void {
  if (!S.cur) return;
  removeSlot(S.cur);
  refreshList();
}

/**
 * The cards kept in this browser from last time (src/state/saved.ts), back in their order with their titles and
 * placements; the card that was selected is selected again. Runs first in the queue, so files added meanwhile wait.
 * `progress` hears how many of the stored cards are done.
 */
export function restoreWork(progress?: (done: number, total: number) => void): Promise<void> {
  return enqueue(async () => {
    holdSaves(true);
    try {
      let stored: Awaited<ReturnType<typeof readCards>>;
      try {
        stored = await readCards();
      } catch {
        return; // Storage blocked: the tool starts empty.
      }
      let restored = 0;
      const lost: string[] = [];
      progress?.(0, stored.length);
      for (const [i, { record, file }] of stored.entries()) {
        progress?.(i, stored.length);
        const card = parseSavedCard(record);
        if (!card) continue;
        const pic = file instanceof File ? file : new File([file], card.name, { type: file.type });
        const d = await decode(pic);
        if (!d) {
          lost.push(card.name);
          continue;
        }
        const sl = restoreSlot(card, pic, d.bitmap);
        restored++;
        if (sl.id === savedCurrentId() || !S.cur) S.cur = sl;
        refreshList();
      }
      progress?.(stored.length, stored.length);
      if (restored || lost.length) {
        const summary = [restored ? t('restored', restored) : '', lost.length ? t('cantRead', lost.join(', ')) : ''];
        toast(summary.filter(Boolean).join(' · '));
      }
    } finally {
      // Saves the restored list once: a picture that could not be read is dropped from storage with it.
      holdSaves(false);
    }
  });
}

/** «Clear list»: every card goes, with what the browser kept of them. The settings stay. Asks first. */
export function clearList(): void {
  const n = S.slots.length;
  if (!n || !confirm(t('confirmClear', n))) return;
  void enqueue(async () => {
    for (const sl of [...S.slots]) removeSlot(sl);
    refreshList();
    saveSoon(0);
  });
}

// ── Export ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Everything an export needs, captured when it starts, so editing during Export all can't change or break it. */
interface ExportJob {
  num: number | null;
  title: string;
  back: BackText;
  file: File;
  iw: number;
  ih: number;
  rect: Rect;
}

const snapshot = (sl: Slot): ExportJob => ({
  num: sl.num,
  title: sl.t,
  back: { ...S.back },
  file: sl.file,
  iw: sl.iw,
  ih: sl.ih,
  rect: rectOf(sl),
});

function outputCanvas(): CanvasRenderingContext2D {
  const cv = document.createElement('canvas');
  cv.width = OUT.w;
  cv.height = OUT.h;
  const c = cv.getContext('2d');
  if (!c) throw new Error('2D canvas unavailable');
  return c;
}

function toTiff(c: CanvasRenderingContext2D): Blob {
  const px = c.getImageData(0, 0, OUT.w, OUT.h).data;
  return new Blob([encodeTiffRgb(px, OUT.w, OUT.h, f.dpi)], { type: 'image/tiff' });
}

/** Re-reads the original file at full resolution. Throws if it can't be read or changed on disk since loading. */
async function frontTiff(job: ExportJob): Promise<Blob> {
  const d = await decodeFull(job.file);
  try {
    if (d.iw !== job.iw || d.ih !== job.ih) throw new Error(`${job.file.name} changed since it was added`);
    const c = outputCanvas();
    drawFront(c, d.bitmap, job.rect, PX_PER_MM, f);
    return toTiff(c);
  } finally {
    d.bitmap.close();
  }
}

async function backTiff(job: ExportJob): Promise<Blob> {
  await loadBackFonts(job.title, job.back);
  const c = outputCanvas();
  drawBackG(c, job.title, PX_PER_MM, job.back, f);
  return toTiff(c);
}

async function exportJob(job: ExportJob, withBack: boolean): Promise<boolean> {
  let front: Blob;
  try {
    front = await frontTiff(job);
  } catch (err) {
    console.error(err);
    toast(t('cantRead', job.file.name));
    return false;
  }
  download(front, exportFileName(job.num, job.title, 'front'));
  if (withBack) download(await backTiff(job), exportFileName(job.num, job.title, 'back'));
  return true;
}

export async function exportCurrent(): Promise<void> {
  const sl = S.cur;
  if (!sl || busy.exporting) return;
  const b = byId<HTMLButtonElement>('expOne');
  busy.exporting = true;
  b.disabled = true;
  b.textContent = t('exporting');
  await wait(30);
  try {
    await exportJob(snapshot(sl), S.withBack);
  } finally {
    busy.exporting = false;
    b.textContent = t('expOne');
    renderPanel();
  }
}

/**
 * Every card but the sample. Below 300 dpi asks first. Sequential, 700 ms apart (the browser's multi-download pace).
 */
export async function exportAll(): Promise<void> {
  if (busy.exporting) return;
  const jobs = S.slots.filter((sl) => !sl.sample).map(snapshot);
  if (!jobs.length) return;
  const low = jobs.filter((j) => effectiveDpi(j.iw, j.rect.w) < 300);
  if (low.length && !confirm(t('confirmLow', low.length, low.map((j) => cardLabel(j.num, j.title)).join(', '))))
    return;

  const withBack = S.withBack;
  const b = byId<HTMLButtonElement>('expAll');
  busy.exporting = true;
  b.disabled = true;
  byId<HTMLButtonElement>('expOne').disabled = true;
  let ok = 0;
  const failed: string[] = [];
  try {
    for (let k = 0; k < jobs.length; k++) {
      b.textContent = t('exportingN', k + 1, jobs.length);
      await wait(30);
      if (await exportJob(jobs[k], withBack)) ok++;
      else failed.push(jobs[k].file.name);
      await wait(700);
    }
  } finally {
    busy.exporting = false;
    renderPanel();
  }
  const summary = t('exported', ok, withBack);
  toast(failed.length ? `${summary} · ${t('cantRead', failed.join(', '))}` : summary);
}
