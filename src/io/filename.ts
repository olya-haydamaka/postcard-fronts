export interface ParsedName {
  /** Leading number: the card's place in the list and the prefix of its export files. null when there is none. */
  num: number | null;
  title: string;
}

const EXTENSION = /\.[a-z0-9]{1,5}$/i;
/** A leading number and the separator after it: `01 `, `01. `, `01 - `, `01_`, `01) `, or the number alone. */
const LEADING_NUMBER = /^(\d+)(?:[\s.)\-–—]+|$)/;

/**
 * `01 Багрянці.tiff` → number 1, title `Багрянці`; `Sunset.jpg` → no number, title `Sunset`.
 * Underscores read as spaces. A name that is only a number keeps it as the title too.
 */
export function parseFileName(fileName: string): ParsedName {
  const base = fileName.normalize('NFC').replace(EXTENSION, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  const m = LEADING_NUMBER.exec(base);
  if (!m) return { num: null, title: base || fileName };
  return { num: Number(m[1]), title: base.slice(m[0].length).trim() || base };
}

/** A card number as shown everywhere: 01, 02, … 10, 123. */
export const padNumber = (n: number): string => String(n).padStart(2, '0');

/** How a card is named in messages: its number, or its title when it has none. */
export const cardLabel = (num: number | null, title: string): string => (num === null ? title : padNumber(num));

/**
 * `01 Багрянці - front.tiff`; without a number, `Багрянці - front.tiff`. `.` and `,` are removed from the title.
 * Independent of the UI language.
 */
export const exportFileName = (num: number | null, title: string, side: 'front' | 'back'): string =>
  `${num === null ? '' : `${padNumber(num)} `}${title.replace(/[.,]/g, '')} - ${side}.tiff`;
