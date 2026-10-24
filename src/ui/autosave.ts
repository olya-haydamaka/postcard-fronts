import { t } from '../i18n';
import { writeCards } from '../state/saved';
import { S, saveSettings, savedCard } from '../state/store';
import { toast } from './toast';

/**
 * Keeps the work in the browser: the settings at once, the cards a moment after the last change (a drag changes
 * them on every frame). One write at a time; a change made during a write is saved right after it. While the stored
 * cards are being restored nothing is written, or a half-restored list would replace the stored one.
 * `document.body.dataset.saved` is "yes" once everything is stored.
 */
const DELAY_MS = 300;
let timer: ReturnType<typeof setTimeout> | undefined;
let writing = false;
let again = false;
let held = false;
let warned = false;

function mark(): void {
  const all = timer === undefined && !writing && !held && S.slots.every((sl) => sl.saved);
  document.body.dataset.saved = all ? 'yes' : 'no';
}

async function write(): Promise<void> {
  if (writing) {
    again = true;
    return;
  }
  writing = true;
  const files = new Map<number, File>();
  for (const sl of S.slots) if (!sl.saved) files.set(sl.id, sl.file);
  try {
    await writeCards(S.slots.map(savedCard), files);
    // A picture replaced while it was being written is still unsaved.
    for (const sl of S.slots) if (files.get(sl.id) === sl.file) sl.saved = true;
    warned = false;
  } catch {
    // Storage full or blocked: the work goes on, and the page warns before a reload would lose it.
    if (!warned) toast(t('notSaved'));
    warned = true;
  } finally {
    writing = false;
    if (again) {
      again = false;
      void write();
    }
    mark();
  }
}

/** Saves the settings now and the cards after `delay` ms without another change. */
export function saveSoon(delay = DELAY_MS): void {
  if (held) return;
  saveSettings();
  clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    void write();
  }, delay);
  mark();
}

/** Leaving the page: write what is waiting now instead of after the delay. */
export function saveNow(): void {
  if (timer === undefined) return;
  clearTimeout(timer);
  timer = undefined;
  void write();
}

/** Stops saving while the stored cards are restored; the release saves the restored list once. */
export function holdSaves(on: boolean): void {
  held = on;
  if (!on) saveSoon(0);
  mark();
}

/** True while some picture is not in the browser's storage: leaving the page now would lose it. */
export const hasUnsaved = (): boolean => S.slots.some((sl) => !sl.saved);
