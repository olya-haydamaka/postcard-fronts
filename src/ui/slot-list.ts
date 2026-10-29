import { preset } from '../config/preset';
import { resolutionLevel, type ResolutionLevel } from '../geometry/fit';
import { t } from '../i18n';
import { isImageFile } from '../io/decode';
import { padNumber } from '../io/filename';
import { drawFront } from '../render/front';
import { dpiOf, rectOf, S, type Slot } from '../state/store';
import { byId, sizeCanvas } from './dom';

const THUMB_W = 38;

export interface SlotListHandlers {
  onSelect(sl: Slot): void;
  onDropFile(sl: Slot, file: File): void;
}

let handlers: SlotListHandlers = { onSelect: () => undefined, onDropFile: () => undefined };

export function bindList(h: SlotListHandlers): void {
  handlers = h;
}

/** Status dot class + text for a card: "312 dpi", "240 dpi · low" or "150 dpi · too low". */
export function slotStatus(sl: Slot): [ResolutionLevel, string] {
  const d = dpiOf(sl);
  const level = resolutionLevel(d);
  const n = `${Math.round(d)} dpi`;
  if (level === 'ok') return [level, n];
  return [level, `${n} · ${t(level === 'warn' ? 'low' : 'tooLow')}`];
}

const rowOf = (sl: Slot) => byId('list').querySelector<HTMLElement>(`.slot[data-id="${sl.id}"]`);

function buildRow(sl: Slot): HTMLElement {
  const row = document.createElement('div');
  row.className = 'slot';
  row.dataset.id = String(sl.id);
  const n = document.createElement('span');
  n.className = 'n';
  n.textContent = sl.num === null ? '' : padNumber(sl.num);
  const cv = document.createElement('canvas');
  const text = document.createElement('div');
  text.className = 't';
  const title = document.createElement('b');
  title.textContent = sl.t;
  const st = document.createElement('span');
  st.className = 'st';
  text.append(title, st);
  row.append(n, cv, text);

  row.addEventListener('click', () => handlers.onSelect(sl));
  row.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    row.classList.add('over');
  });
  row.addEventListener('dragleave', () => row.classList.remove('over'));
  row.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    row.classList.remove('over');
    document.body.classList.remove('dragging');
    const file = [...(e.dataTransfer?.files ?? [])].find(isImageFile);
    if (file) handlers.onDropFile(sl, file);
  });
  return row;
}

/**
 * Brings the rows in line with the list after cards were added or removed: a new card gets a row and a thumbnail,
 * a removed one loses its row, and the rest keep theirs (thumbnails are not redrawn), all in list order.
 */
export function renderList(): void {
  const rows = byId('rows');
  const ids = new Set(S.slots.map((sl) => String(sl.id)));
  for (const row of [...rows.querySelectorAll<HTMLElement>('.slot')]) if (!ids.has(row.dataset.id ?? '')) row.remove();
  for (const sl of S.slots) {
    const row = rowOf(sl);
    rows.append(row ?? buildRow(sl));
    if (!row) renderThumb(sl);
  }
  // An empty list says where the cards will come from.
  byId('listEmpty').hidden = S.slots.length > 0;
  byId('listFoot').hidden = !S.slots.length;
  markCurrent();
}

export function renderThumb(sl: Slot): void {
  const row = rowOf(sl);
  if (!row) return;
  const f = preset.format;
  const k = THUMB_W / f.widthMm;
  const c = sizeCanvas(row.querySelector('canvas')!, f.widthMm, f.heightMm, k);
  drawFront(c, sl.preview, rectOf(sl), k, f);
  const [cls, text] = slotStatus(sl);
  const st = row.querySelector<HTMLElement>('.st')!;
  st.className = `st ${cls}`;
  st.textContent = text;
  if (sl.sample) {
    const tag = document.createElement('span');
    tag.className = 'sample-tag';
    tag.textContent = t('sampleTag');
    st.append(tag);
  }
}

export function renderSlotTitle(sl: Slot): void {
  const b = rowOf(sl)?.querySelector('.t b');
  if (b) b.textContent = sl.t;
}

export function markCurrent(): void {
  byId('list')
    .querySelectorAll<HTMLElement>('.slot')
    .forEach((e) => e.classList.toggle('cur', e.dataset.id === String(S.cur?.id)));
}
