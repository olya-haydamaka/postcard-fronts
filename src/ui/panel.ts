import { preset } from '../config/preset';
import { isCropped, resetToAuto, toManual } from '../geometry/fit';
import { t } from '../i18n';
import { busy, dpiOf, layout, marginLine, rectOf, S, saveBack, type Overlays, type Slot } from '../state/store';
import { saveSoon } from './autosave';
import { byId } from './dom';
import { markCurrent, renderSlotTitle, slotStatus } from './slot-list';

const f = preset.format;
const input = (id: string) => byId<HTMLInputElement>(id);
const button = (id: string) => byId<HTMLButtonElement>(id);

/** Shows `value` unless the user is typing in the field. */
function show(el: HTMLInputElement, value: string): void {
  if (document.activeElement !== el) el.value = value;
}

export function renderPanel(): void {
  const sl = S.cur;

  const ttl = input('ttl');
  ttl.disabled = !sl;
  show(ttl, sl?.t ?? '');
  button('ttlReset').disabled = !sl || sl.t === sl.t0;
  byId('pName').textContent = sl ? sl.name : '—';
  byId('pPx').textContent = sl ? `${sl.iw} × ${sl.ih} px` : '';
  // The Replace button is a label for a file input: disabling the input disables the label.
  input('one').disabled = !sl;
  byId('replaceBtn').classList.toggle('off', !sl);

  for (const id of ['mAuto', 'mMan', 'center', 'reset', 'rm']) button(id).disabled = !sl;
  for (const id of ['sc', 'dx', 'dy']) input(id).disabled = !sl;
  if (!busy.exporting) button('expOne').disabled = !sl;
  const mode = sl?.mode ?? 'auto';
  byId('mAuto').classList.toggle('on', mode === 'auto');
  byId('mMan').classList.toggle('on', mode === 'manual');
  const pct = Math.round((sl?.s ?? 1) * 100);
  input('sc').value = String(pct);
  byId('scV').textContent = `${pct}%`;
  input('dx').value = String(+(sl?.dx ?? 0).toFixed(1));
  input('dy').value = String(+(sl?.dy ?? 0).toFixed(1));

  const dpiSt = byId('dpiSt');
  if (sl) {
    const r = rectOf(sl);
    const [cls] = slotStatus(sl);
    byId('dpi').textContent = String(Math.round(dpiOf(sl)));
    dpiSt.className = `st ${cls}`;
    dpiSt.textContent = t(cls === 'ok' ? 'good' : cls === 'warn' ? 'soft' : 'blurry');
    byId('placed').textContent =
      t('placed', r.w.toFixed(1), r.h.toFixed(1)) + (isCropped(r, layout()) ? t('cropped') : '');
  } else {
    byId('dpi').textContent = '—';
    dpiSt.className = 'st';
    dpiSt.textContent = '';
    byId('placed').textContent = '';
  }

  byId('fTrim').classList.toggle('on', S.fit === 'trim');
  byId('fMargin').classList.toggle('on', S.fit === 'margin');
  byId('fFrame').classList.toggle('on', S.fit === 'frame');
  // The field is the Side margins' own; Top & side margins draws its white from the trim line instead.
  input('mg').disabled = S.fit !== 'margin';
  input('mg').value = String(S.margin);
  input('bl').value = String(S.bleed);
  byId('trimNote').textContent = t(
    'trim',
    (f.widthMm - 2 * S.bleed).toFixed(1),
    (f.heightMm - 2 * S.bleed).toFixed(1),
    (marginLine() - S.bleed).toFixed(1),
  );

  show(input('artist'), S.back.artist);
  show(input('website'), S.back.website);

  if (!busy.exporting) {
    const n = S.slots.length;
    button('expAll').disabled = !n;
    button('expAll').textContent = t('expAll', n);
  }
  markCurrent();
}

export interface PanelHandlers {
  /** Re-render one card (thumbnail, stage if current, panel). */
  update(sl?: Slot): void;
  /** Re-render every thumbnail, the stage and the panel (after a card-wide setting changed). */
  refreshAll(): void;
  renderStage(): void;
  replace(file: File): void;
  remove(): void;
  exportOne(): void;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function bindPanel(h: PanelHandlers): void {
  const manual = (sl: Slot) => toManual(sl, sl, layout());

  const toAuto = () => {
    if (!S.cur) return;
    resetToAuto(S.cur);
    h.update();
  };
  button('mAuto').addEventListener('click', toAuto);
  button('reset').addEventListener('click', toAuto);
  button('mMan').addEventListener('click', () => {
    if (!S.cur) return;
    manual(S.cur);
    h.update();
  });
  input('sc').addEventListener('input', (e) => {
    const sl = S.cur;
    if (!sl) return;
    manual(sl);
    sl.s = Number((e.target as HTMLInputElement).value) / 100;
    h.update(sl);
  });
  for (const axis of ['dx', 'dy'] as const) {
    input(axis).addEventListener('change', (e) => {
      const sl = S.cur;
      if (!sl) return;
      manual(sl);
      sl[axis] = Number((e.target as HTMLInputElement).value) || 0;
      h.update(sl);
    });
  }
  button('center').addEventListener('click', () => {
    const sl = S.cur;
    if (!sl) return;
    sl.dx = 0;
    sl.dy = 0;
    h.update(sl);
  });
  button('rm').addEventListener('click', () => h.remove());
  input('one').addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement;
    const file = el.files?.[0];
    if (file) h.replace(file);
    el.value = '';
  });

  input('mg').addEventListener('change', (e) => {
    S.margin = clamp(Number((e.target as HTMLInputElement).value) || 0, 0, 30);
    h.refreshAll();
  });
  input('bl').addEventListener('change', (e) => {
    S.bleed = clamp(Number((e.target as HTMLInputElement).value) || 0, 0, 5);
    h.refreshAll();
  });
  for (const [id, fit] of [
    ['fTrim', 'trim'],
    ['fMargin', 'margin'],
    ['fFrame', 'frame'],
  ] as const) {
    button(id).addEventListener('click', () => {
      S.fit = fit;
      h.refreshAll();
    });
  }

  const overlays: [string, keyof Overlays][] = [
    ['oBleed', 'bleed'],
    ['oTrim', 'trim'],
    ['oSafe', 'safe'],
    ['oBack', 'back'],
  ];
  for (const [id, key] of overlays) {
    const box = input(id);
    box.checked = S.ov[key];
    box.addEventListener('change', () => {
      S.ov[key] = box.checked;
      h.renderStage();
      saveSoon();
    });
  }

  const ttl = input('ttl');
  ttl.addEventListener('input', () => {
    const sl = S.cur;
    if (!sl) return;
    sl.t = ttl.value.trim() || sl.t0;
    renderSlotTitle(sl);
    button('ttlReset').disabled = sl.t === sl.t0;
    if (S.ov.back) h.renderStage();
    saveSoon();
  });
  ttl.addEventListener('blur', () => {
    ttl.value = S.cur?.t ?? '';
  });
  button('ttlReset').addEventListener('click', () => {
    const sl = S.cur;
    if (!sl) return;
    sl.t = sl.t0;
    renderSlotTitle(sl);
    h.renderStage();
    renderPanel();
    saveSoon();
  });

  // Name and website: the same on every back, remembered in this browser. An empty field is left off the back.
  for (const key of ['artist', 'website'] as const) {
    const el = input(key);
    el.addEventListener('input', () => {
      S.back[key] = el.value.trim();
      saveBack();
      if (S.ov.back) h.renderStage();
    });
    el.addEventListener('blur', () => {
      el.value = S.back[key];
    });
  }

  const withBack = input('withBack');
  withBack.checked = S.withBack;
  withBack.addEventListener('change', () => {
    S.withBack = withBack.checked;
    saveSoon();
  });
  button('expOne').addEventListener('click', () => h.exportOne());
}
