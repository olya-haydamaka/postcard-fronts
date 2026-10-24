import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LANGS } from '../src/i18n';
import { uk } from '../src/i18n/uk';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url));
const html = read('index.html').toString('utf8');
const head = html.slice(0, html.indexOf('</head>'));

const meta = (attr: 'name' | 'property', key: string): string[] =>
  [...head.matchAll(new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`, 'g'))].map((m) => m[1]);
const one = (attr: 'name' | 'property', key: string): string => {
  const all = meta(attr, key);
  expect(all, key).toHaveLength(1);
  return all[0];
};

/** The website's language → Open Graph locale codes (its `src/lib/metadata.ts`). */
const OG_LOCALE: Record<string, string> = {
  uk: 'uk_UA',
  en: 'en_US',
  pl: 'pl_PL',
  de: 'de_DE',
  ja: 'ja_JP',
  es: 'es_ES',
  fr: 'fr_FR',
};

describe('index.html head: search results and link previews', () => {
  it('is in Ukrainian, the default language, and titled like the page', () => {
    expect(html).toMatch(/<html lang="uk">/);
    expect(head).toContain(`<title>${uk.h1}</title>`);
    expect(one('property', 'og:title')).toBe(uk.h1);
    const description = one('name', 'description');
    expect(description).toMatch(/[\u{400}-\u{4ff}]/u);
    expect(description).not.toMatch(/\b(the|and|your)\b/i);
    expect(one('property', 'og:description')).toBe(description);
  });

  it('canonical, og:url and og:image sit on the domain the Worker serves', () => {
    const wrangler = read('wrangler.jsonc').toString('utf8');
    const host = /"pattern":\s*"([^"]+)"/.exec(wrangler)?.[1];
    expect(host).toBeTruthy();
    const origin = `https://${host}/`;
    expect(head).toContain(`<link rel="canonical" href="${origin}" />`);
    expect(one('property', 'og:url')).toBe(origin);
    expect(one('property', 'og:image')).toBe(`${origin}og.png`);
    expect(one('name', 'twitter:card')).toBe('summary_large_image');
  });

  it('the preview image exists at the size the head states', () => {
    const png = read('public/og.png');
    expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
    // IHDR: width and height are the first two big-endian words after the 16-byte signature + chunk header.
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([
      Number(one('property', 'og:image:width')),
      Number(one('property', 'og:image:height')),
    ]);
    expect(one('property', 'og:image:alt')).not.toBe('');
  });

  it('names every language of the app as an Open Graph locale, Ukrainian first', () => {
    expect(one('property', 'og:locale')).toBe('uk_UA');
    const codes = Object.keys(LANGS);
    expect(codes.every((c) => c in OG_LOCALE), 'a new language needs its og:locale').toBe(true);
    expect(meta('property', 'og:locale:alternate')).toEqual(codes.filter((c) => c !== 'uk').map((c) => OG_LOCALE[c]));
  });
});

describe('the first paint', () => {
  it('is styled: the stylesheet is linked in the head, never imported from a script', () => {
    expect(head).toContain('<link rel="stylesheet" href="./src/styles/index.css" />');
    // Imported from JavaScript, Vite's dev server would add the CSS only after an unstyled first paint.
    expect(read('src/main.ts').toString('utf8')).not.toMatch(/^import\s+['"][^'"]+\.css['"]/m);
  });

  it('shows the splash, whose card shapes carry their own colours (a shape without one is drawn black)', () => {
    const body = html.slice(html.indexOf('<body>'));
    expect(body.indexOf('id="splash"'), 'the splash comes first').toBeLessThan(body.indexOf('<header'));
    const svg = body.slice(body.indexOf('<svg class="splash-card"'), body.indexOf('</svg>'));
    const shapes = svg.match(/<rect\b[^>]*>/g) ?? [];
    expect(shapes).toHaveLength(3);
    for (const shape of shapes) expect(shape, shape).toMatch(/\sfill="[^"]+"/);
    expect(body).toMatch(/<header inert>/);
    expect(body).toMatch(/<main inert>/);
  });
});
