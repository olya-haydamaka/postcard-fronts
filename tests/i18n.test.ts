import { describe, expect, it } from 'vitest';
import { LANG_NAMES, LANGS } from '../src/i18n';
import { en } from '../src/i18n/en';
import { uk } from '../src/i18n/uk';
import { evalPrototype, prototypeSource } from './prototype';

type Entry = string | ((...a: unknown[]) => string);
type Table = Record<string, Entry>;

const proto = evalPrototype<{ en: Table; uk: Table }>(
  `${prototypeSource('const I18N={', 'let LANG=')}\nreturn I18N;`,
);

/**
 * Where the copy deliberately differs from the prototype (changelog/001): cards come from the files, so the
 * empty-slot and title-matching copy went; the back's name and website became editable; a third auto-fit mode, Top
 * & side margins, joined the two (its button, and a sentence in the auto-fit tooltip); the view zoom has controls;
 * the work is kept in the browser, with a button to clear the list and a splash screen while it comes back. The
 * header links to the source code (changelog/003). An empty list says where the cards come from (the handoff's
 * copy, not in its prototype), and the panel's hint shows only while there are no cards, so it speaks of pictures,
 * not of "this slot" (changelog/007). The tool's Ukrainian name is «Листівки», as on the organisation's site
 * (changelog/008).
 */
const ADDED = [
  'added',
  'artist',
  'backNote',
  'clearAll',
  'confirmClear',
  'listEmpty',
  'notSaved',
  'restored',
  'restoring',
  'fitFrame',
  'sBack',
  'source',
  'website',
  'zoom',
  'zoomFit',
  'zoomFitTip',
  'zoomIn',
  'zoomOut',
  'zoomTip',
];
const CHANGED = ['dropFmt', 'fitTip', 'h1', 'noPicHint'];
const DROPPED = ['matched', 'noPic', 'noPicSlot'];

/** Sample arguments for every function entry; several cases where the copy branches. */
const samples: Record<string, unknown[][]> = {
  expAll: [[0], [15]],
  placed: [['89.0', '118.7']],
  trim: [['105.0', '148.0', '8.0']],
  exportingN: [[2, 15]],
  confirmLow: [[2, '03, 07']],
  exported: [
    [15, true],
    [1, false],
  ],
  cantRead: [['01 Багрянці.tif']],
  filesNote: [
    ['01 Багрянці', true],
    ['01 Багрянці', false],
    ['Sunset', true],
  ],
  confirmClear: [[15]],
  restored: [[15]],
  restoring: [[3, 15]],
};

describe('i18n', () => {
  for (const [name, dict] of [
    ['en', en],
    ['uk', uk],
  ] as const) {
    it(`${name}: the prototype's keys, less the dropped and plus the added ones; the rest verbatim`, () => {
      const ours = dict as unknown as Table;
      const theirs = proto[name];
      for (const key of [...DROPPED, ...CHANGED]) expect(theirs, key).toHaveProperty(key);
      for (const key of ADDED) expect(theirs, key).not.toHaveProperty(key);
      expect(Object.keys(ours).sort()).toEqual([...Object.keys(theirs).filter((k) => !DROPPED.includes(k)), ...ADDED].sort());
      for (const key of Object.keys(theirs)) {
        if (DROPPED.includes(key) || CHANGED.includes(key)) continue;
        const a = ours[key];
        const b = theirs[key];
        expect(typeof a, key).toBe(typeof b);
        if (typeof a === 'string') expect(a, key).toBe(b);
        else {
          const cases = samples[key];
          expect(cases, `samples for ${key}`).toBeDefined();
          for (const args of cases) expect(a(...args), key).toBe((b as (...x: unknown[]) => string)(...args));
        }
      }
    });
  }

  it("the website's seven languages, in its order, each named in itself", () => {
    const site = ['uk', 'en', 'pl', 'de', 'ja', 'es', 'fr'];
    expect(Object.keys(LANGS)).toEqual(site);
    expect(Object.keys(LANG_NAMES)).toEqual(site);
  });

  // The prototype has only Ukrainian and English; the other five are checked for completeness instead.
  const translations = Object.entries(LANGS).filter(([code]) => code !== 'en' && code !== 'uk') as [
    string,
    Table,
  ][];

  /** Keys whose English word is also right in that language. Anything else equal to English is untranslated. */
  const SAME_AS_EN: Record<string, string[]> = {
    pl: [],
    de: ['sExp', 'website'],
    ja: [],
    es: ['manual'],
    fr: ['sExp', 'sPlace'],
  };

  for (const [code, dict] of translations) {
    it(`${code}: every entry translated and filled, with the arguments it is given`, () => {
      const same = Object.keys(en).filter((k) => typeof dict[k] === 'string' && dict[k] === (en as Table)[k]);
      expect(same.sort(), 'equal to English').toEqual(SAME_AS_EN[code]);
      for (const [key, v] of Object.entries(dict)) {
        if (typeof v === 'string') {
          expect(v.trim(), key).not.toBe('');
          continue;
        }
        const cases = key === 'added' ? [[2, 1]] : samples[key];
        expect(cases, `samples for ${key}`).toBeDefined();
        for (const args of cases) {
          const s = v(...args);
          for (const a of args) if (typeof a !== 'boolean') expect(s, `${key} shows ${String(a)}`).toContain(String(a));
        }
      }
      const d = dict as unknown as typeof en;
      expect(d.exported(3, true), 'exported names the backs').not.toBe(d.exported(3, false));
      expect(d.added(0, 0)).toBe('');
      expect(d.added(2, 0)).not.toContain('·');
    });
  }

  it('every translation keeps the numbers of the English copy (sizes, dpi, mm, the 01 example)', () => {
    const numbers = (s: string) => (s.match(/\d+/g) ?? []).sort();
    for (const [code, dict] of [['uk', uk as unknown as Table], ...translations] as const) {
      for (const [key, v] of Object.entries(en)) {
        if (typeof v === 'string') expect(numbers(dict[key] as string), `${code}.${key}`).toEqual(numbers(v));
      }
    }
  });

  it('the add summary names only what happened', () => {
    expect([en.added(15, 0), en.added(2, 1), en.added(0, 1), en.added(0, 0)]).toEqual([
      '15 added',
      '2 added · 1 replaced',
      '1 replaced',
      '',
    ]);
    expect([uk.added(15, 0), uk.added(2, 1), uk.added(0, 1), uk.added(0, 0)]).toEqual([
      'Додано: 15',
      'Додано: 2 · Замінено: 1',
      'Замінено: 1',
      '',
    ]);
  });
});
