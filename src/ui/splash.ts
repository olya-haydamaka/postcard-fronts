import { t } from '../i18n';
import { wait } from './dom';

/**
 * The splash screen. It is in the page's HTML, so it covers the very first paint: before it goes, the language is
 * applied, the fonts are in and the saved work is restored, card by card, underneath it. Then it fades out over the
 * finished page. It never stays up for good: 15 s without progress and it goes anyway.
 */
const STALL_MS = 15_000;
const FONTS_MAX_MS = 2000;

let watchdog = setTimeout(() => void hideSplash(), STALL_MS);
let hiding = false;

/** "Restoring your work: 3 of 15", with its bar; nothing while there is nothing to restore. */
export function splashProgress(done: number, total: number): void {
  clearTimeout(watchdog);
  watchdog = setTimeout(() => void hideSplash(), STALL_MS);
  const text = document.getElementById('splashText');
  const bar = document.getElementById('splashBar');
  if (!text || !bar || !total) return;
  text.textContent = t('restoring', done, total);
  bar.style.width = `${(done / total) * 100}%`;
}

/** Fades the splash out once the fonts are in and the page under it has painted, then removes it. */
export async function hideSplash(): Promise<void> {
  const el = document.getElementById('splash');
  if (!el || hiding) return;
  hiding = true;
  clearTimeout(watchdog);
  await Promise.race([document.fonts.ready, wait(FONTS_MAX_MS)]);
  // Two frames, so the restored page is painted before the splash starts to go.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  for (const part of document.querySelectorAll<HTMLElement>('body > header, body > main')) part.inert = false;
  el.classList.add('out');
  const remove = () => el.remove();
  el.addEventListener('transitionend', (e) => {
    if (e.target === el) remove();
  });
  // Reduced motion, or a transition that never ends: it goes all the same.
  setTimeout(remove, 800);
}
