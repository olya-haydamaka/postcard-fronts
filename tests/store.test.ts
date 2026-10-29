import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HAYDAMAKA } from '../src/config/preset';
import {
  addPicture,
  parseSavedCard,
  removeSlot,
  restoreSlot,
  S,
  savedCard,
  setPicture,
  storedSettings,
} from '../src/state/store';

// Made-up titles (the series’ real ones stay private) with their edge cases: a full stop, commas, an apostrophe, Ї, Є, Щ.
const TITLES = [
  'Багрянці',
  'У затінку саду',
  'Ожина',
  'Простір',
  'Сосна. Пісня гірського вітру',
  'Тепло',
  'Вечірній ліхтар',
  'Місто моє',
  'Їжакові стежки',
  'Березовий гай, травневий спокій',
  'Єдиний промінь',
  'Руда лисиця',
  "Подвір'я, що спить",
  'Ранній іній',
  'Щебет птахів',
];

const bitmap = () => ({ close: vi.fn() }) as unknown as ImageBitmap;
const add = (name: string) => addPicture(new File([''], name), bitmap(), 1500, 2000);
const titles = () => S.slots.map((s) => s.t);

beforeEach(() => {
  S.slots = [];
  S.cur = null;
});

describe('the card list', () => {
  it('starts empty', () => {
    expect(S.slots).toEqual([]);
    expect(S.cur).toBeNull();
  });

  it('acceptance #1: fifteen numbered files, whatever order they arrive in, list 01 … 15 with their titles', () => {
    const names = TITLES.map((t, i) => `${String(i + 1).padStart(2, '0')} ${t}.jpg`).reverse();
    for (const n of names) expect(add(n).replaced).toBe(false);
    expect(S.slots.map((s) => s.num)).toEqual(TITLES.map((_, i) => i + 1));
    expect(titles()).toEqual(TITLES);
  });

  it('numbered cards by number; the rest after them, in the order they were added', () => {
    for (const n of ['10 Десять.jpg', 'Sunset.jpg', '02 Два.jpg', 'Alpha.jpg', '01 Один.tiff']) add(n);
    expect(titles()).toEqual(['Один', 'Два', 'Десять', 'Sunset', 'Alpha']);
  });

  it('the same number and title again replaces the picture: edited title kept, placement back to auto', () => {
    const first = add('01 Багрянці.jpg').slot;
    const old = first.preview;
    first.t = 'Багрянці, осінь';
    Object.assign(first, { mode: 'manual', s: 1.4, dx: 3 });

    const again = add('01 багрянці.tiff');
    expect(again).toEqual({ slot: first, replaced: true });
    expect(S.slots).toHaveLength(1);
    expect(first).toMatchObject({ t: 'Багрянці, осінь', name: '01 багрянці.tiff', mode: 'auto', s: 1, dx: 0 });
    expect(old.close).toHaveBeenCalled();
  });

  it('the same number with another title is another card', () => {
    add('01 Багрянці.jpg');
    add('01 Простір.jpg');
    expect(titles()).toEqual(['Багрянці', 'Простір']);
  });

  it('removing the current card selects the next one, the previous at the end, and nothing once empty', () => {
    for (const n of ['01 A.jpg', '02 B.jpg', '03 C.jpg']) add(n);
    const [a, b, c] = S.slots;
    S.cur = b;
    removeSlot(b);
    expect(S.cur).toBe(c);
    expect(b.preview.close).toHaveBeenCalled();
    removeSlot(c);
    expect(S.cur).toBe(a);
    removeSlot(a);
    expect(S.cur).toBeNull();
    expect(S.slots).toEqual([]);
  });

  it('the back starts with the preset text when nothing is stored', () => {
    expect(S.back).toEqual(HAYDAMAKA.back);
  });
});

describe('the work kept in the browser', () => {
  it('a card is stored as its title, number, placement and picture size; read back, it is the same card', () => {
    const { slot } = add('03 Ожина.jpg');
    Object.assign(slot, { t: 'Ожина, нова', mode: 'manual', s: 1.2, dx: 3, dy: -1.5, bw: 89, bh: 118.7 });
    const rec = savedCard(slot);
    expect(rec).toEqual({
      id: slot.id,
      num: 3,
      t: 'Ожина, нова',
      t0: 'Ожина',
      name: '03 Ожина.jpg',
      iw: 1500,
      ih: 2000,
      mode: 'manual',
      s: 1.2,
      dx: 3,
      dy: -1.5,
      bw: 89,
      bh: 118.7,
      sample: false,
    });
    expect(parseSavedCard(structuredClone(rec))).toEqual(rec);
  });

  it('the sample keeps its flag through storage; a card stored before the flag existed is a real picture', () => {
    const { slot } = add('01 Приклад.jpg');
    slot.sample = true;
    expect(parseSavedCard(structuredClone(savedCard(slot)))).toMatchObject({ sample: true });
    const older: Partial<ReturnType<typeof savedCard>> = savedCard(slot);
    delete older.sample;
    expect(parseSavedCard(older)).toMatchObject({ sample: false });
  });

  it('a real picture put on the sample card clears its flag', () => {
    const { slot } = add('01 Приклад.jpg');
    slot.sample = true;
    setPicture(slot, new File([''], 'Ожина.jpg'), bitmap(), 1500, 2000);
    expect(slot.sample).toBe(false);
  });

  it('anything else read back is not a card', () => {
    const rec = savedCard(add('01 A.jpg').slot);
    for (const bad of [null, 'x', { ...rec, mode: 'x' }, { ...rec, s: Number.NaN }, { ...rec, t: 1 }, { ...rec, num: '1' }]) {
      expect(parseSavedCard(bad)).toBeNull();
    }
  });

  it('a restored card keeps its id and its place; new cards get ids after it', () => {
    const rec = { ...savedCard(add('02 B.jpg').slot), id: 40 };
    S.slots = [];
    const file = new File([''], '02 B.jpg');
    const back = restoreSlot(rec, file, bitmap());
    expect(back).toMatchObject({ id: 40, num: 2, t: 'B', file, saved: true });
    add('01 A.jpg');
    expect(titles()).toEqual(['A', 'B']);
    expect(S.slots[0].id).toBeGreaterThan(40);
  });

  it('a new or replaced picture is not stored yet', () => {
    const { slot } = add('01 A.jpg');
    expect(slot.saved).toBe(false);
    slot.saved = true;
    setPicture(slot, new File([''], '01 A.jpg'), bitmap(), 10, 10);
    expect(slot.saved).toBe(false);
  });

  it('settings come back checked; anything missing or out of range falls back to the default', () => {
    expect(storedSettings(null)).toEqual({
      fit: 'trim',
      margin: 10,
      bleed: 2,
      ov: { bleed: true, trim: true, safe: false, back: false },
      withBack: true,
      cur: null,
    });
    expect(
      storedSettings({ fit: 'frame', margin: 12.5, bleed: 3, ov: { safe: true }, withBack: false, cur: 7 }),
    ).toEqual({
      fit: 'frame',
      margin: 12.5,
      bleed: 3,
      ov: { bleed: true, trim: true, safe: true, back: false },
      withBack: false,
      cur: 7,
    });
    expect(storedSettings({ fit: 'zoom', margin: 99, bleed: -1, ov: 'x', withBack: 'no' })).toEqual(storedSettings(null));
  });
});
