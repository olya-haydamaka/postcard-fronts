/** Physical card format. All geometry is in mm, in card coordinates: (0,0) is the top-left of the file. */
export interface CardFormat {
  /** Full file width including bleed, mm. */
  widthMm: number;
  /** Full file height including bleed, mm. */
  heightMm: number;
  dpi: number;
  /** Default bleed per side, mm. Editable in the UI; affects overlays and snapping only. */
  defaultBleedMm: number;
  /** Safe zone inside the trim line, mm. */
  safeMm: number;
  /** How far the blurred "cropped preview" extends around the card on stage, mm. */
  ghostPadMm: number;
}

export const POSTCARD_109x152: CardFormat = {
  widthMm: 109,
  heightMm: 152,
  dpi: 300,
  defaultBleedMm: 2,
  safeMm: 5,
  ghostPadMm: 14,
};

export const MM_PER_INCH = 25.4;

export const pxPerMm = (f: CardFormat): number => f.dpi / MM_PER_INCH;

/** Output pixel size: 109 × 152 mm at 300 dpi → 1287 × 1795 px. */
export function outputPx(f: CardFormat): { w: number; h: number } {
  const k = pxPerMm(f);
  return { w: Math.round(f.widthMm * k), h: Math.round(f.heightMm * k) };
}
