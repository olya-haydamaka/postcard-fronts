import { preset, type BackText } from '../config/preset';
import {
  effectiveDpi,
  placedRect,
  resetToAuto,
  type FitMode,
  type Layout,
  type Placement,
  type Rect,
} from '../geometry/fit';
import { parseFileName } from '../io/filename';
import { readStored, writeStored } from './storage';

/** One card: a picture, its placement and its title. A card exists only while it has a picture. */
export interface Slot extends Placement {
  /** Stable identity for the list row. */
  id: number;
  /** Leading number of the file name: the place in the list and the export prefix. null: none, listed last. */
  num: number | null;
  /** Current title. */
  t: string;
  /** Title read from the file name. */
  t0: string;
  /** The picked file; export re-reads it at full resolution. */
  file: File;
  /** Downscaled bitmap for the stage and the thumbnail. */
  preview: ImageBitmap;
  name: string;
  /** Original pixel size (dpi is computed from it, not from the preview). */
  iw: number;
  ih: number;
  /** Whether this picture is kept in the browser yet (src/state/saved.ts); a new or replaced one is not. */
  saved: boolean;
}

/** What the browser keeps of a card besides its picture. */
export type SavedCard = Omit<Slot, 'file' | 'preview' | 'saved'>;

export const savedCard = (sl: Slot): SavedCard => ({
  id: sl.id,
  num: sl.num,
  t: sl.t,
  t0: sl.t0,
  name: sl.name,
  iw: sl.iw,
  ih: sl.ih,
  mode: sl.mode,
  s: sl.s,
  dx: sl.dx,
  dy: sl.dy,
  bw: sl.bw,
  bh: sl.bh,
});

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A stored record read back, checked field by field; null when it isn't a card. */
export function parseSavedCard(v: unknown): SavedCard | null {
  const r = v as Partial<Record<keyof SavedCard, unknown>> | null;
  if (!r || typeof r !== 'object') return null;
  const nums = [r.id, r.iw, r.ih, r.s, r.dx, r.dy, r.bw, r.bh];
  if (!nums.every(isNum) || !(r.num === null || isNum(r.num))) return null;
  if (typeof r.t !== 'string' || typeof r.t0 !== 'string' || typeof r.name !== 'string') return null;
  if (r.mode !== 'auto' && r.mode !== 'manual') return null;
  return r as SavedCard;
}

export interface Overlays {
  bleed: boolean;
  trim: boolean;
  safe: boolean;
  back: boolean;
}

export interface SnapGuide {
  x: number | null;
  y: number | null;
}

export interface State {
  /** In list order: numbered cards by number, then the rest in the order they were added. */
  slots: Slot[];
  /** The selected card; null while the list is empty. */
  cur: Slot | null;
  fit: FitMode;
  margin: number;
  bleed: number;
  ov: Overlays;
  withBack: boolean;
  /** Printed on every back. */
  back: BackText;
  /** Active snap guide while dragging. */
  snap: SnapGuide | null;
  /** Stage scale, px per mm: the fitted scale × zoom. */
  k: number;
  /** View zoom, relative to the fitted stage (1 = 100 %). Kept while switching cards; never stored. */
  zoom: number;
}

export const BACK_STORAGE_KEY = 'haydamaka-postcard-back';
/** The card-wide settings and the selected card, remembered with the work (the pictures are in IndexedDB). */
export const SETTINGS_STORAGE_KEY = 'haydamaka-postcard-settings';

interface Settings {
  fit: FitMode;
  margin: number;
  bleed: number;
  ov: Overlays;
  withBack: boolean;
  /** Id of the selected card. */
  cur: number | null;
}

const DEFAULTS: Settings = {
  fit: 'trim',
  margin: 10,
  bleed: preset.format.defaultBleedMm,
  ov: { bleed: true, trim: true, safe: false, back: false },
  withBack: true,
  cur: null,
};

/** The stored settings, each one checked; anything missing or off its range falls back to the default. */
export function storedSettings(v: unknown = readStored(SETTINGS_STORAGE_KEY)): Settings {
  const r = (v && typeof v === 'object' ? v : {}) as Partial<Record<keyof Settings, unknown>>;
  const ov = (r.ov && typeof r.ov === 'object' ? r.ov : {}) as Partial<Record<keyof Overlays, unknown>>;
  const inRange = (x: unknown, lo: number, hi: number, d: number) => (isNum(x) && x >= lo && x <= hi ? x : d);
  const bool = (x: unknown, d: boolean) => (typeof x === 'boolean' ? x : d);
  return {
    fit: r.fit === 'trim' || r.fit === 'margin' || r.fit === 'frame' ? r.fit : DEFAULTS.fit,
    margin: inRange(r.margin, 0, 30, DEFAULTS.margin),
    bleed: inRange(r.bleed, 0, 5, DEFAULTS.bleed),
    ov: {
      bleed: bool(ov.bleed, DEFAULTS.ov.bleed),
      trim: bool(ov.trim, DEFAULTS.ov.trim),
      safe: bool(ov.safe, DEFAULTS.ov.safe),
      back: bool(ov.back, DEFAULTS.ov.back),
    },
    withBack: bool(r.withBack, DEFAULTS.withBack),
    cur: isNum(r.cur) ? r.cur : null,
  };
}

const settings = storedSettings();

function storedBack(): BackText {
  const v = readStored(BACK_STORAGE_KEY) as Partial<BackText> | null;
  return {
    artist: typeof v?.artist === 'string' ? v.artist : preset.back.artist,
    website: typeof v?.website === 'string' ? v.website : preset.back.website,
  };
}

export const S: State = {
  slots: [],
  cur: null,
  fit: settings.fit,
  margin: settings.margin,
  bleed: settings.bleed,
  ov: settings.ov,
  withBack: settings.withBack,
  back: storedBack(),
  snap: null,
  k: 3,
  zoom: 1,
};

export const saveBack = (): void => writeStored(BACK_STORAGE_KEY, S.back);

/** The card selected when the page was last left, by id; the restored list selects it again. */
export const savedCurrentId = (): number | null => settings.cur;

export function saveSettings(): void {
  const v: Settings = { fit: S.fit, margin: S.margin, bleed: S.bleed, ov: S.ov, withBack: S.withBack, cur: S.cur?.id ?? null };
  writeStored(SETTINGS_STORAGE_KEY, v);
}

/** True while an export runs; the panel then leaves the export buttons alone. */
export const busy = { exporting: false };

export const curIndex = (): number => (S.cur ? S.slots.indexOf(S.cur) : -1);

export const layout = (): Layout => ({
  cw: preset.format.widthMm,
  ch: preset.format.heightMm,
  fit: S.fit,
  margin: S.margin,
  bleed: S.bleed,
  frame: preset.frameMm,
});

/**
 * Where the side-margin guides sit, mm from the file edge: the Side margins field, or in Top & side margins the trim
 * line plus that mode's white. The preview's margin lines, snapping and the trim note follow it.
 */
export const marginLine = (): number => (S.fit === 'frame' ? S.bleed + preset.frameMm : S.margin);

export const rectOf = (sl: Slot): Rect => placedRect(sl, sl, layout());

export const dpiOf = (sl: Slot): number => effectiveDpi(sl.iw, rectOf(sl).w);

const listOrder = (a: Slot, b: Slot): number => (a.num ?? Infinity) - (b.num ?? Infinity) || a.id - b.id;

let nextId = 1;

/**
 * Puts a decoded picture on the list, titled and placed by its file name. A file with the same number and title as a
 * card already there (the same picture added again, say after re-saving it) replaces that card's picture instead.
 */
export function addPicture(
  file: File,
  preview: ImageBitmap,
  iw: number,
  ih: number,
): { slot: Slot; replaced: boolean } {
  const { num, title } = parseFileName(file.name);
  const same = S.slots.find((s) => s.num === num && s.t0.toLowerCase() === title.toLowerCase());
  if (same) {
    setPicture(same, file, preview, iw, ih);
    return { slot: same, replaced: true };
  }
  const slot: Slot = {
    id: nextId++,
    num,
    t: title,
    t0: title,
    file,
    preview,
    name: file.name,
    iw,
    ih,
    mode: 'auto',
    s: 1,
    dx: 0,
    dy: 0,
    bw: 0,
    bh: 0,
    saved: false,
  };
  S.slots.push(slot);
  S.slots.sort(listOrder);
  return { slot, replaced: false };
}

/** A card brought back from the browser's storage, with its id, title and placement as they were. */
export function restoreSlot(card: SavedCard, file: File, preview: ImageBitmap): Slot {
  const slot: Slot = { ...card, file, preview, saved: true };
  nextId = Math.max(nextId, card.id + 1);
  S.slots.push(slot);
  S.slots.sort(listOrder);
  return slot;
}

/** A new picture for an existing card: number and title stay, the placement starts over in auto. */
export function setPicture(sl: Slot, file: File, preview: ImageBitmap, iw: number, ih: number): void {
  if (sl.preview !== preview) sl.preview.close();
  Object.assign(sl, { file, preview, name: file.name, iw, ih, saved: false });
  resetToAuto(sl);
}

/** Takes a card off the list. When it was the current one, the next card (or the previous, at the end) follows. */
export function removeSlot(sl: Slot): void {
  const i = S.slots.indexOf(sl);
  if (i < 0) return;
  S.slots.splice(i, 1);
  sl.preview.close();
  if (S.cur === sl) S.cur = S.slots[Math.min(i, S.slots.length - 1)] ?? null;
}
