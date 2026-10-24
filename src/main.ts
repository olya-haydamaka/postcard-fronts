// The styles are linked from index.html (src/styles/index.css), so they are in before the first paint.
import { outputPx } from './config/format';
import { preset } from './config/preset';
import { applyLangToDom, getLang } from './i18n';
import { BACK_FONT } from './render/back-g';
import { S } from './state/store';
import {
  addFiles,
  clearList,
  dropOnSlot,
  exportAll,
  exportCurrent,
  removeCurrent,
  replaceCurrent,
  restoreWork,
} from './ui/actions';
import { byId } from './ui/dom';
import { bindGlobal } from './ui/global';
import { bindPanel, renderPanel } from './ui/panel';
import { bindSections } from './ui/sections';
import { bindList, renderThumb } from './ui/slot-list';
import { bindStage, renderStage } from './ui/stage';
import { hideSplash, splashProgress } from './ui/splash';
import { refreshAll, select, selectSlot, update } from './ui/view';

function applyLang(): void {
  applyLangToDom();
  byId<HTMLSelectElement>('lang').value = getLang();
  S.slots.forEach(renderThumb);
  renderPanel();
}

/** The back preview is drawn on a canvas, which can't wait for fonts by itself: redraw once they are in. */
async function loadCanvasFonts(): Promise<void> {
  try {
    // Cyrillic and Latin, so titles and names in either script are ready.
    await document.fonts.load(`500 40px ${BACK_FONT}`, `${S.back.artist} ABC АБВ`);
    await document.fonts.load(`italic 400 40px ${BACK_FONT}`, `«Назва Title» ${S.back.website}`);
  } catch {
    // A font failure must never block the tool.
  }
  renderStage();
}

function boot(): void {
  // Everything is bound before anything is awaited, so a file picked right away is never lost.
  const f = preset.format;
  const px = outputPx(f);
  byId('spec').textContent = `${f.widthMm} × ${f.heightMm} mm · ${f.dpi} dpi · ${px.w} × ${px.h} px · RGB TIFF`;

  bindSections();
  bindList({ onSelect: selectSlot, onDropFile: (sl, file) => void dropOnSlot(sl, file) });
  bindStage(update);
  bindPanel({
    update,
    refreshAll,
    renderStage,
    replace: (file) => void replaceCurrent(file),
    remove: removeCurrent,
    exportOne: () => void exportCurrent(),
  });
  bindGlobal({
    addFiles: (files) => void addFiles(files),
    exportAll: () => void exportAll(),
    applyLang,
    select,
    update,
  });
  byId('clearAll').addEventListener('click', clearList);
  applyLang();
  renderStage();
  renderPanel();
  // The splash covers the page until the saved work is back and the back's fonts are in.
  void Promise.allSettled([restoreWork(splashProgress), loadCanvasFonts()]).then(hideSplash);
}

boot();
