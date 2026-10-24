import { readStored, writeStored } from '../state/storage';

export const SECTIONS_STORAGE_KEY = 'haydamaka-postcard-sections';

/**
 * The panel's sections fold. The markup's `open` attribute is the default (Picture, Resolution and Export start open);
 * whatever the viewer opens or closes is remembered in this browser, by section id.
 */
export function bindSections(): void {
  const stored = readStored(SECTIONS_STORAGE_KEY);
  const state: Record<string, boolean> =
    stored && typeof stored === 'object' && !Array.isArray(stored) ? { ...(stored as Record<string, boolean>) } : {};

  for (const d of document.querySelectorAll<HTMLDetailsElement>('#panel details.sec')) {
    if (typeof state[d.id] === 'boolean') d.open = state[d.id];
    d.addEventListener('toggle', () => {
      if (state[d.id] === d.open) return;
      state[d.id] = d.open;
      writeStored(SECTIONS_STORAGE_KEY, state);
    });
    // An info circle in a heading shows its tip; clicking it must not fold the section.
    for (const info of d.querySelectorAll('summary .info')) info.addEventListener('click', (e) => e.preventDefault());
  }
}
