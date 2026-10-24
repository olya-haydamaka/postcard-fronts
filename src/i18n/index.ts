import { de } from './de';
import { en, type Dict, type Key } from './en';
import { es } from './es';
import { fr } from './fr';
import { ja } from './ja';
import { pl } from './pl';
import { uk } from './uk';

/**
 * The haydamaka.com website's languages, in its order (its `src/i18n/routing.ts`). Adding a language = one
 * dictionary here and its name below; the header's language menu is built from them.
 */
export const LANGS = { uk, en, pl, de, ja, es, fr } satisfies Record<string, Dict>;
export type Lang = keyof typeof LANGS;

/** Each language named in itself, as the website's menus name them. */
export const LANG_NAMES: Record<Lang, string> = {
  uk: 'Українська',
  en: 'English',
  pl: 'Polski',
  de: 'Deutsch',
  ja: '日本語',
  es: 'Español',
  fr: 'Français',
};

export const LANG_STORAGE_KEY = 'haydamaka-postcard-lang';
const DEFAULT_LANG: Lang = 'uk';

const isLang = (v: unknown): v is Lang => typeof v === 'string' && Object.hasOwn(LANGS, v);

function readStoredLang(): Lang {
  try {
    const v = localStorage.getItem(LANG_STORAGE_KEY);
    return isLang(v) ? v : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

let lang: Lang = readStoredLang();

export const getLang = (): Lang => lang;

export function setLang(next: string): void {
  if (!isLang(next)) return;
  lang = next;
  try {
    localStorage.setItem(LANG_STORAGE_KEY, next);
  } catch {
    // Storage blocked (private window, site data off): the choice lasts for this page only.
  }
}

type Args<K extends Key> = Dict[K] extends (...a: infer A) => string ? A : [];

export function t<K extends Key>(key: K, ...args: Args<K>): string {
  const v = LANGS[lang][key] as string | ((...a: unknown[]) => string);
  return typeof v === 'function' ? v(...args) : v;
}

/** Plain-string entries only; used for keys named in markup. */
function text(key: string): string {
  const v = (LANGS[lang] as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : '';
}

/**
 * Re-labels every element that names a key: data-i18n (text), data-i18n-tip (tooltip), data-i18n-title (title),
 * data-i18n-label (aria-label, for buttons that show only a sign).
 */
export function applyLangToDom(root: ParentNode = document): void {
  document.documentElement.lang = lang;
  document.title = t('h1');
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((e) => {
    e.textContent = text(e.dataset.i18n ?? '');
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-tip]').forEach((e) => {
    e.dataset.tip = text(e.dataset.i18nTip ?? '');
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((e) => {
    e.title = text(e.dataset.i18nTitle ?? '');
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-label]').forEach((e) => {
    e.setAttribute('aria-label', text(e.dataset.i18nLabel ?? ''));
  });
}
