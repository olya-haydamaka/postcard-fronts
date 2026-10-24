import { describe, expect, it } from 'vitest';
import {
  autoRect,
  effectiveDpi,
  isCropped,
  placedRect,
  resetToAuto,
  resolutionLevel,
  toManual,
  type FitMode,
  type Layout,
  type Placement,
} from '../src/geometry/fit';

const layout = (fit: FitMode, margin = 10, bleed = 2): Layout => ({ cw: 109, ch: 152, fit, margin, bleed, frame: 10 });
const fresh = (): Placement => ({ mode: 'auto', s: 1, dx: 0, dy: 0, bw: 0, bh: 0 });

describe('auto-fit (acceptance #2, #3)', () => {
  it('Fill card: a 2:3 picture is 109 × 163.5 mm, top at 0, 11.5 mm cropped at the bottom', () => {
    const r = autoRect(2000, 3000, layout('trim'));
    expect(r.x).toBeCloseTo(0, 9);
    expect(r.y).toBe(0);
    expect(r.w).toBeCloseTo(109, 9);
    expect(r.h).toBeCloseTo(163.5, 9);
    expect(r.y + r.h - 152).toBeCloseTo(11.5, 9);
    expect(isCropped(r, layout('trim'))).toBe(true);
  });

  it('Fill card: a 3:4 picture is 114 × 152 mm with 2.5 mm cropped on each side', () => {
    const r = autoRect(3000, 4000, layout('trim'));
    expect(r.w).toBeCloseTo(114, 9);
    expect(r.h).toBeCloseTo(152, 9);
    expect(r.x).toBeCloseTo(-2.5, 9);
    expect(r.y).toBe(0);
  });

  it('Side margins 10 mm: 3:4 → 89 × 118.7 mm, 2:3 → 88 × 132 mm, centred, not cropped', () => {
    const a = autoRect(3000, 4000, layout('margin'));
    expect(a.w).toBeCloseTo(89, 9);
    expect(a.h).toBeCloseTo(118.667, 3);
    expect(a.x).toBeCloseTo(10, 9);
    expect(a.y).toBeCloseTo((152 - a.h) / 2, 9);
    const b = autoRect(2000, 3000, layout('margin'));
    expect(b.w).toBeCloseTo(88, 9);
    expect(b.h).toBeCloseTo(132, 9);
    expect(b.x).toBeCloseTo(10.5, 9);
    expect(b.y).toBeCloseTo(10, 9);
    expect(isCropped(a, layout('margin'))).toBe(false);
    expect(isCropped(b, layout('margin'))).toBe(false);
  });

  it('Top & side margins: 10 mm from the trim line at the top and sides, the bottom keeps the rest', () => {
    // 2 mm bleed + 10 mm: the picture starts 12 mm from the file edge; the trim box is 2…107 × 2…150.
    const portrait = autoRect(3000, 4000, layout('frame'));
    expect(portrait.x).toBeCloseTo(12, 9);
    expect(portrait.y).toBeCloseTo(12, 9);
    expect(portrait.w).toBeCloseTo(85, 9);
    expect(portrait.h).toBeCloseTo(113.333, 3);
    expect(150 - (portrait.y + portrait.h)).toBeCloseTo(24.667, 3);
    const twoThree = autoRect(2000, 3000, layout('frame'));
    expect(twoThree.w).toBeCloseTo(85, 9);
    expect(twoThree.h).toBeCloseTo(127.5, 9);
    expect(150 - (twoThree.y + twoThree.h)).toBeCloseTo(10.5, 9);
    const landscape = autoRect(3000, 2000, layout('frame'));
    expect(landscape.x).toBeCloseTo(12, 9);
    expect(landscape.y).toBeCloseTo(12, 9);
    expect(landscape.w).toBeCloseTo(85, 9);
    expect(landscape.h).toBeCloseTo(56.667, 3);
    for (const r of [portrait, twoThree, landscape]) expect(isCropped(r, layout('frame'))).toBe(false);
  });

  it('Top & side margins: a picture too tall for the frame keeps 10 mm at the bottom too, and narrows', () => {
    const r = autoRect(1000, 2000, layout('frame'));
    expect(r.y).toBeCloseTo(12, 9);
    expect(r.h).toBeCloseTo(128, 9);
    expect(150 - (r.y + r.h)).toBeCloseTo(10, 9);
    expect(r.w).toBeCloseTo(64, 9);
    expect(r.x).toBeCloseTo(22.5, 9);
  });

  it('Top & side margins follow the bleed, not the Side margins field', () => {
    const r = autoRect(3000, 4000, layout('frame', 10, 3));
    expect(r.x).toBeCloseTo(13, 9);
    expect(r.y).toBeCloseTo(13, 9);
    expect(r.w).toBeCloseTo(83, 9);
    expect(autoRect(3000, 4000, layout('frame', 25))).toEqual(autoRect(3000, 4000, layout('frame')));
  });

  it('an exact fit is not reported as cropped', () => {
    expect(isCropped(autoRect(1090, 1520, layout('trim')), layout('trim'))).toBe(false);
  });
});

describe('manual placement', () => {
  const pic = { iw: 3000, ih: 4000 };

  it('turning manual does not move the picture', () => {
    for (const fit of ['trim', 'margin', 'frame'] as const) {
      const p = fresh();
      const before = placedRect(pic, p, layout(fit));
      toManual(pic, p, layout(fit));
      expect(p.mode).toBe('manual');
      expect(p.s).toBe(1);
      const after = placedRect(pic, p, layout(fit));
      expect(after.x).toBeCloseTo(before.x, 9);
      expect(after.y).toBeCloseTo(before.y, 9);
      expect(after.w).toBeCloseTo(before.w, 9);
      expect(after.h).toBeCloseTo(before.h, 9);
    }
  });

  it('scales about the card centre and adds the offset', () => {
    const p = fresh();
    toManual(pic, p, layout('margin'));
    p.s = 2;
    p.dx = 3;
    p.dy = -4;
    const r = placedRect(pic, p, layout('margin'));
    expect(r.w).toBeCloseTo(178, 9);
    expect(r.x).toBeCloseTo((109 - 178) / 2 + 3, 9);
    expect(r.y).toBeCloseTo((152 - r.h) / 2 - 4, 9);
  });

  it('acceptance #5: mode, margin and bleed changes re-fit only auto slots', () => {
    const auto = fresh();
    const manual = fresh();
    const L0 = layout('trim');
    toManual(pic, manual, L0);
    manual.dx = 1.5;
    const manualBefore = placedRect(pic, manual, L0);
    const autoBefore = placedRect(pic, auto, L0);
    const changes = [layout('margin'), layout('margin', 15), layout('trim', 3), layout('frame'), layout('frame', 10, 4)];
    for (const L of changes) {
      expect(placedRect(pic, manual, L)).toEqual(manualBefore);
    }
    expect(placedRect(pic, auto, layout('margin'))).not.toEqual(autoBefore);
  });

  it('reset to auto follows the global settings again', () => {
    const p = fresh();
    toManual(pic, p, layout('trim'));
    p.s = 1.7;
    resetToAuto(p);
    expect(placedRect(pic, p, layout('margin'))).toEqual(autoRect(3000, 4000, layout('margin')));
  });
});

describe('resolution', () => {
  it('effective dpi = pixels / placed inches', () => {
    expect(effectiveDpi(1287, 109)).toBeCloseTo(299.9, 1);
    expect(effectiveDpi(3000, 254)).toBeCloseTo(300, 9);
  });

  it('levels: ≥ 300 ok, 200–299 warn, < 200 bad', () => {
    expect(resolutionLevel(300)).toBe('ok');
    expect(resolutionLevel(299.9)).toBe('warn');
    expect(resolutionLevel(200)).toBe('warn');
    expect(resolutionLevel(199.9)).toBe('bad');
  });
});
