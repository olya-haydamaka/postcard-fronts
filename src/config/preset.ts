import { POSTCARD_109x152, type CardFormat } from './format';

/** Text printed on every back (option G). Stays the same in every UI language. */
export interface BackText {
  artist: string;
  website: string;
}

/** Everything artist-specific lives here; the rest of the code reads it from the preset. */
export interface Preset {
  id: string;
  format: CardFormat;
  /** What the back says until the user changes it in the panel (the change is remembered in that browser). */
  back: BackText;
  /**
   * «Top & side margins» auto-fit: the white from the trim line to the picture's top, left and right, mm. The
   * auto-fit tooltip names this figure in every language.
   */
  frameMm: number;
}

export const HAYDAMAKA: Preset = {
  id: 'haydamaka',
  format: POSTCARD_109x152,
  // Placeholders, for anyone to replace with their own under «Back» (example.com is reserved for examples, RFC 2606).
  back: { artist: 'ARTIST NAME', website: 'example.com' },
  frameMm: 10,
};

export const preset: Preset = HAYDAMAKA;
