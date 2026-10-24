import { describe, expect, it } from 'vitest';
import { guides, snapAxis, SNAP_MM } from '../src/geometry/snap';
import { clampZoom, stageScale, stepZoom, wheelZoomFactor, ZOOM_MAX, ZOOM_MIN } from '../src/geometry/stage';
import { evalPrototype, prototypeSource } from './prototype';

describe('snapping (acceptance #6)', () => {
  const xs = guides(109, 2, 10, 5);

  it('guide set: edges, bleed, safe zone, side margin, centre', () => {
    expect(xs).toEqual([0, 2, 7, 10, 54.5, 99, 102, 107, 109]);
  });

  it('an edge within 1.5 mm of the trim line snaps to it', () => {
    expect(snapAxis(3.2, 50, 109, xs)).toEqual({ d: expect.closeTo(-1.2, 9), t: 2 });
    // Right edge at 105.6: the trim line (107) is 1.4 away, nothing else is closer.
    expect(snapAxis(65.6, 40, 109, xs)).toEqual({ d: expect.closeTo(1.4, 9), t: 107 });
  });

  it('beyond the threshold nothing snaps', () => {
    expect(snapAxis(2 + SNAP_MM + 0.01, 30, 109, [2])).toBeNull();
  });

  it('the nearest line wins', () => {
    // Left edge at 1.2: 0 is 1.2 away, the trim line at 2 is 0.8 away.
    expect(snapAxis(1.2, 30, 109, xs)?.t).toBe(2);
  });

  it('an edge snaps to the centre line too; the picture centre snaps only to the centre line', () => {
    expect(snapAxis(53.5, 20, 109, xs)).toEqual({ d: expect.closeTo(1, 9), t: 54.5 });
    expect(snapAxis(44, 20.6, 109, xs)).toEqual({ d: expect.closeTo(0.2, 9), t: 54.5 });
    // A centre 1 mm from the margin line (10) does not snap to it.
    expect(snapAxis(-20, 62, 109, [10])).toBeNull();
  });

  it('matches the prototype on a sweep of positions', () => {
    const proto = evalPrototype<(pos: number, size: number, full: number, lines: number[]) => unknown>(
      `${prototypeSource('function snapAxis(', 'function guides(')}\nreturn snapAxis;`,
      { SNAP: 1.5 },
    );
    for (let pos = -10; pos < 110; pos += 0.37) {
      for (const size of [20, 54.5, 89, 114]) {
        expect(snapAxis(pos, size, 109, xs)).toEqual(proto(pos, size, 109, xs));
      }
    }
  });
});

describe('stage scale', () => {
  const box = {
    viewWidth: 852,
    viewHeight: 700,
    captionHeight: 24,
    showBack: false,
    cardWidthMm: 109,
    cardHeightMm: 152,
    ghostPadMm: 14,
  };

  it('fits the front, its blurred surround and its caption into the view', () => {
    // Width: 852 / 137 = 6.22; height: (700 − 24) / 180 = 3.76.
    expect(stageScale(box)).toBeCloseTo((700 - 24) / 180, 9);
  });

  it('leaves room for the back when shown', () => {
    expect(stageScale({ ...box, showBack: true })).toBeCloseTo((852 - 28) / (137 + 109), 9);
  });

  it('is clamped to 1.2–6', () => {
    expect(stageScale({ ...box, viewWidth: 100, viewHeight: 100 })).toBe(1.2);
    expect(stageScale({ ...box, viewWidth: 5000, viewHeight: 5000 })).toBe(6);
  });
});

describe('view zoom', () => {
  it('the buttons step through 50 % … 400 %, from any zoom the wheel left', () => {
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1, -1)).toBe(0.75);
    expect(stepZoom(1.1, 1)).toBe(1.25);
    expect(stepZoom(1.1, -1)).toBe(1);
    expect(stepZoom(4, 1)).toBe(ZOOM_MAX);
    expect(stepZoom(0.5, -1)).toBe(ZOOM_MIN);
    expect([ZOOM_MIN, ZOOM_MAX]).toEqual([0.5, 4]);
  });

  it('the wheel zooms in when rolled away from you, out when rolled back, about 16 % a notch', () => {
    expect(wheelZoomFactor(-100)).toBeCloseTo(1.162, 3);
    expect(wheelZoomFactor(100)).toBeCloseTo(1 / 1.162, 3);
    // A fast flick counts as one notch, not ten.
    expect(wheelZoomFactor(-1000)).toBe(wheelZoomFactor(-100));
    expect(clampZoom(9)).toBe(4);
    expect(clampZoom(0.1)).toBe(0.5);
  });
});
