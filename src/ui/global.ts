import { toManual } from '../geometry/fit';
import { LANG_NAMES, setLang } from '../i18n';
import { curIndex, layout, S, type Slot } from '../state/store';
import { hasUnsaved, saveNow } from './autosave';
import { byId } from './dom';
import { renderStage } from './stage';

export interface GlobalHandlers {
  addFiles(files: Iterable<File>): void;
  exportAll(): void;
  applyLang(): void;
  select(i: number): void;
  update(sl: Slot): void;
}

/** Header controls, window-wide drag and drop, keyboard shortcuts, resize and the unsaved-work warning. */
export function bindGlobal(h: GlobalHandlers): void {
  const files = byId<HTMLInputElement>('files');
  files.addEventListener('change', () => {
    if (files.files) h.addFiles(files.files);
    files.value = '';
  });
  byId('expAll').addEventListener('click', () => h.exportAll());
  const lang = byId<HTMLSelectElement>('lang');
  lang.replaceChildren(...Object.entries(LANG_NAMES).map(([code, name]) => new Option(name, code)));
  lang.addEventListener('change', () => {
    setLang(lang.value);
    h.applyLang();
  });

  addEventListener('dragover', (e) => {
    e.preventDefault();
    document.body.classList.add('dragging');
  });
  addEventListener('dragleave', (e) => {
    if (!e.relatedTarget) document.body.classList.remove('dragging');
  });
  addEventListener('drop', (e) => {
    e.preventDefault();
    document.body.classList.remove('dragging');
    if (e.dataTransfer?.files) h.addFiles(e.dataTransfer.files);
  });

  addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    // Leave browser shortcuts (Ctrl/Cmd + −/+ zoom and the like) to the browser.
    if (e.ctrlKey || e.metaKey) return;
    if (e.key === 'PageDown') {
      e.preventDefault();
      h.select(curIndex() + 1);
      return;
    }
    if (e.key === 'PageUp') {
      e.preventDefault();
      h.select(curIndex() - 1);
      return;
    }
    const sl = S.cur;
    if (!sl) return;
    const step = e.shiftKey ? 2 : 0.5;
    const move = (
      { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<
        string,
        [number, number] | undefined
      >
    )[e.key];
    if (move) {
      e.preventDefault();
      toManual(sl, sl, layout());
      sl.dx += move[0];
      sl.dy += move[1];
      h.update(sl);
    } else if (e.key === '+' || e.key === '=') {
      toManual(sl, sl, layout());
      sl.s = Math.min(3, sl.s * 1.02);
      h.update(sl);
    } else if (e.key === '-') {
      toManual(sl, sl, layout());
      sl.s = Math.max(0.2, sl.s / 1.02);
      h.update(sl);
    }
  });

  addEventListener('resize', renderStage);

  // The work is kept in the browser; only a picture not stored yet (still being written, or no room) would be lost.
  addEventListener('pagehide', saveNow);
  addEventListener('beforeunload', (e) => {
    if (!hasUnsaved()) return;
    e.preventDefault();
    e.returnValue = ''; // older engines
  });

  // Glyphs for an edited title may arrive after the first paint of the back preview.
  document.fonts.addEventListener('loadingdone', () => {
    if (S.ov.back) renderStage();
  });
}
