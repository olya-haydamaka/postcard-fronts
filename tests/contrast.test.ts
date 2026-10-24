import { describe, expect, it } from 'vitest';
import {
  backdropAt,
  casingRuns,
  contrast,
  needed,
  toneFor,
  WHITE,
  type RGB,
  type RGBA,
} from '../src/render/contrast';

// The guide colours, as src/render/overlays.ts draws them.
const TRIM: RGBA = [178, 70, 58, 1];
const SAFE: RGBA = [91, 78, 62, 0.55];
const MARGIN: RGBA = [138, 120, 98, 0.5];

/** The orange of «Багрянці», where the trim line disappeared. */
const ORANGE: RGB = [232, 80, 30];
const DARK_RED: RGB = [90, 30, 20];

/** `n` steps along a line, three colours across each, from a colour per step. */
const along = (n: number, at: (i: number) => RGB): RGB[][] => Array.from({ length: n }, (_, i) => [at(i), at(i), at(i)]);

describe('guide lines that stay visible on any picture', () => {
  it('contrast follows WCAG', () => {
    expect(contrast(WHITE, [0, 0, 0])).toBeCloseTo(21, 9);
    expect(contrast(ORANGE, ORANGE)).toBe(1);
  });

  it('a line needs the contrast it has on white paper, at most 3:1, so faint lines stay faint', () => {
    expect(needed(TRIM)).toBe(3);
    expect(needed(SAFE)).toBeGreaterThan(2);
    expect(needed(SAFE)).toBeLessThan(3);
    expect(needed(MARGIN)).toBeGreaterThan(1.5);
    expect(needed(MARGIN)).toBeLessThan(2);
  });

  it('over white paper no line gets a casing: the design stays as it is', () => {
    for (const line of [TRIM, SAFE, MARGIN]) expect(casingRuns(along(40, () => WHITE), line)).toEqual([]);
  });

  it('the red trim line over the orange painting gets a light casing along its whole length', () => {
    expect(casingRuns(along(40, () => ORANGE), TRIM)).toEqual([{ from: 0, to: 40, tone: 'light' }]);
    expect(casingRuns(along(40, () => ORANGE), MARGIN)).toEqual([{ from: 0, to: 40, tone: 'light' }]);
    expect(casingRuns(along(40, () => DARK_RED), TRIM)).toEqual([{ from: 0, to: 40, tone: 'light' }]);
  });

  it('only where the line disappears: half over the painting, half over white paper', () => {
    expect(casingRuns(along(40, (i) => (i < 20 ? ORANGE : WHITE)), TRIM)).toEqual([{ from: 0, to: 20, tone: 'light' }]);
  });

  it('a busy picture does not chop the casing up: one-segment gaps are bridged', () => {
    // Segments of 4 steps: orange, white, orange, white, orange.
    const busy = along(20, (i) => (Math.floor(i / 4) % 2 ? WHITE : ORANGE));
    expect(casingRuns(busy, TRIM)).toEqual([{ from: 0, to: 20, tone: 'light' }]);
    // Two white segments in a row are a real gap.
    const gap = along(16, (i) => (i >= 4 && i < 12 ? WHITE : ORANGE));
    expect(casingRuns(gap, TRIM).map((r) => [r.from, r.to])).toEqual([
      [0, 4],
      [12, 16],
    ]);
  });

  it('a segment needs a casing when at least half of what it crosses hides the line', () => {
    const mostlyWhite = Array.from({ length: 4 }, (): RGB[] => [ORANGE, WHITE, WHITE]);
    expect(casingRuns(mostlyWhite, TRIM)).toEqual([]);
    const mostlyOrange = Array.from({ length: 4 }, (): RGB[] => [ORANGE, ORANGE, WHITE]);
    expect(casingRuns(mostlyOrange, TRIM)).toHaveLength(1);
  });

  it('the casing tone stands out from the picture and from the line: dark under a light line on a light picture', () => {
    expect(toneFor(TRIM, ORANGE)).toBe('light');
    expect(toneFor([240, 240, 240, 1], [200, 200, 200])).toBe('dark');
  });
});

describe('what the card shows under a line', () => {
  // A 2 × 2 picture: red, green / blue, transparent.
  const px = {
    width: 2,
    height: 2,
    data: [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0],
  };
  const r = { x: 10, y: 20, w: 40, h: 60 };

  it('the picture where it is placed, white paper elsewhere', () => {
    expect(backdropAt(px, r, 15, 25)).toEqual([255, 0, 0]);
    expect(backdropAt(px, r, 45, 25)).toEqual([0, 255, 0]);
    expect(backdropAt(px, r, 15, 75)).toEqual([0, 0, 255]);
    expect(backdropAt(px, r, 5, 25)).toEqual(WHITE);
    expect(backdropAt(px, r, 50, 25)).toEqual(WHITE);
  });

  it('a transparent pixel shows the white card under it', () => {
    expect(backdropAt(px, r, 45, 75)).toEqual(WHITE);
  });
});
