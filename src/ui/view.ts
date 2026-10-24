import { S, type Slot } from '../state/store';
import { saveSoon } from './autosave';
import { renderPanel } from './panel';
import { renderList, renderThumb } from './slot-list';
import { renderStage } from './stage';

/** One card changed: its thumbnail, the stage when it is the current one, and the panel. */
export function update(sl: Slot | null = S.cur): void {
  if (sl) renderThumb(sl);
  if (sl === S.cur) renderStage();
  renderPanel();
  saveSoon();
}

/** Selects the card at list position `i`, clamped to the list. */
export function select(i: number): void {
  if (!S.slots.length) return;
  S.cur = S.slots[Math.max(0, Math.min(S.slots.length - 1, i))];
  renderStage();
  renderPanel();
  saveSoon();
}

export function selectSlot(sl: Slot): void {
  if (!S.slots.includes(sl)) return;
  S.cur = sl;
  renderStage();
  renderPanel();
  saveSoon();
}

/** The list itself changed (cards added or removed): rows, stage and panel. */
export function refreshList(): void {
  renderList();
  renderStage();
  renderPanel();
  saveSoon();
}

/** A card-wide setting changed (fit mode, margin, bleed): every thumbnail, the stage and the panel. */
export function refreshAll(): void {
  S.slots.forEach(renderThumb);
  renderStage();
  renderPanel();
  saveSoon();
}
