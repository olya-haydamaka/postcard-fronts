export const SNAP_MM = 1.5;

export interface SnapHit {
  /** Correction to apply to the position, mm. */
  d: number;
  /** The guide line that was hit, mm. */
  t: number;
}

/**
 * Guide lines on one axis: edges, bleed, safe zone, side margin and the centre. Picture edges snap to all of them
 * (the centre line included); the picture centre snaps only to the centre line.
 */
export function guides(full: number, bleed: number, margin: number, safe: number): number[] {
  const s = bleed + safe;
  return [...new Set([0, bleed, s, margin, full / 2, full - margin, full - s, full - bleed, full])];
}

/** Nearest guide within SNAP_MM of the start edge, end edge or (for the centre line) the centre. Ties keep the first. */
export function snapAxis(pos: number, size: number, full: number, lines: readonly number[]): SnapHit | null {
  let best: SnapHit | null = null;
  for (const t of lines) {
    for (const [off, kind] of [
      [0, 's'],
      [size, 'e'],
      [size / 2, 'c'],
    ] as const) {
      if (kind === 'c' && t !== full / 2) continue;
      const d = t - (pos + off);
      if (Math.abs(d) <= SNAP_MM && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, t };
    }
  }
  return best;
}
