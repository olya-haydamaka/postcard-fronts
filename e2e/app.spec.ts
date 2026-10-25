import { readFile } from 'node:fs/promises';
import { expect, test, type Download, type Page } from '@playwright/test';
import { LANG_NAMES, LANGS } from '../src/i18n';
import {
  addGeneratedImages,
  decodeDownload,
  expectColor,
  nextDownloads,
  pixel,
  savedNames,
  tiffFixture,
  toast,
  twoTone,
  watchErrors,
  type DecodedTiff,
} from './helpers';

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

const SECTIONS = ['secTitle', 'secPicture', 'secPlacement', 'secResolution', 'secCard', 'secBack', 'secShow', 'secExport'];
const OPEN_BY_DEFAULT = ['secPicture', 'secResolution', 'secExport'];

let errors: string[] = [];

test.beforeEach(async ({ page, browserName }) => {
  errors = watchErrors(page, browserName);
  await page.goto('/');
});

test.afterEach(() => {
  expect(errors, 'console errors (CSP violations included)').toEqual([]);
});

/** Waits until the work is in the browser's storage (src/ui/autosave.ts). */
const saved = (page: Page) => expect(page.locator('body')).toHaveAttribute('data-saved', 'yes');
const bytes = async (d: Download) => readFile(await d.path());

/** A pixel of the stage's front canvas, at a point given in CSS px from the card's top left. */
const stagePixel = (page: Page, x: number, y: number) =>
  page.locator('#front').evaluate(
    (cv, [x, y]) => {
      const c = cv as HTMLCanvasElement;
      const r = c.width / c.getBoundingClientRect().width;
      const d = c.getContext('2d')!.getImageData(Math.floor(x * r), Math.floor(y * r), 1, 1).data;
      return [d[0], d[1], d[2]] as [number, number, number];
    },
    [x, y],
  );

const isOpen = (page: Page, id: string) => page.locator(`#${id}`).evaluate((d) => (d as HTMLDetailsElement).open);

/** Opens a folded panel section the way a user does, by its heading. */
async function openSection(page: Page, id: string): Promise<void> {
  if (!(await isOpen(page, id))) await page.click(`#${id} > summary`);
  expect(await isOpen(page, id)).toBe(true);
}

const rowTitles = (page: Page) => page.locator('.slot .t b').allTextContents();
const rowNumbers = (page: Page) => page.locator('.slot .n').allTextContents();

/** Pixels darker than the paper in a box of the decoded file. */
function ink(f: DecodedTiff, x0: number, y0: number, x1: number, y1: number): number {
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (pixel(f, x, y)[0] < 200) n++;
  return n;
}
/** Where option G prints the name + title (top left) and the website (bottom left), at 300 dpi. */
const NAME_BOX = [118, 118, 700, 260] as const;
const SITE_BOX = [118, 1630, 700, 1690] as const;

test('opens in Ukrainian; English persists across reloads (acceptance #8) @smoke', async ({ page }) => {
  await expect(page.locator('h1')).toHaveText('Лицьовий бік листівок');
  await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
  await expect(page.locator('#expOne')).toHaveText('Експортувати цю листівку');
  await page.selectOption('#lang', 'en');
  await expect(page.locator('h1')).toHaveText('Postcard fronts');
  await page.reload();
  await expect(page.locator('h1')).toHaveText('Postcard fronts');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page).toHaveTitle('Postcard fronts');
});

test("offers the website's seven languages; each labels the whole page and fits it", async ({ page }) => {
  await expect(page.locator('#lang option')).toHaveText(Object.values(LANG_NAMES));
  expect(await page.locator('#lang option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))).toEqual(
    Object.keys(LANGS),
  );
  // A card and every section open, so the panel shows all its labels.
  await addGeneratedImages(page, [{ name: '01 Багрянці.jpg', w: 1200, h: 1800, color: '#b5533a' }]);
  await expect(page.locator('.slot')).toHaveCount(1);
  for (const id of SECTIONS) await openSection(page, id);
  const headerHeight = async () => (await page.locator('header').boundingBox())!.height;
  const oneRow = await headerHeight();

  for (const [code, dict] of Object.entries(LANGS)) {
    await page.selectOption('#lang', code);
    await expect(page.locator('html')).toHaveAttribute('lang', code);
    await expect(page).toHaveTitle(dict.h1);
    await expect(page.locator('#expOne')).toHaveText(dict.expOne);
    const blank = await page
      .locator('[data-i18n]')
      .evaluateAll((es) => es.filter((e) => !e.textContent?.trim()).map((e) => (e as HTMLElement).dataset.i18n));
    expect(blank, `${code}: unlabelled`).toEqual([]);
    expect(await headerHeight(), `${code}: the header stays one row`).toBe(oneRow);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${code}: no sideways scroll`).toBe(
      true,
    );
  }
});

test('every info tooltip opens whole: inside the panel, which clips it, and under its icon', async ({ page }) => {
  for (const id of SECTIONS) await openSection(page, id);
  const icons = page.locator('#panel .info');
  const n = await icons.count();
  expect(n).toBeGreaterThanOrEqual(8);
  for (const code of Object.keys(LANGS)) {
    await page.selectOption('#lang', code);
    for (let i = 0; i < n; i++) {
      await icons.nth(i).focus();
      const r = await icons.nth(i).evaluate((el) => {
        // The tooltip is the icon's ::after; its box is measured from its containing block.
        const cs = getComputedStyle(el, '::after');
        let cb: HTMLElement = el as HTMLElement;
        while (getComputedStyle(cb).position === 'static' && cb.parentElement) cb = cb.parentElement;
        const c = cb.getBoundingClientRect();
        const left = c.left + cb.clientLeft + parseFloat(cs.left);
        const width = parseFloat(cs.width) + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
        const panel = document.getElementById('panel')!.getBoundingClientRect();
        return {
          key: (el as HTMLElement).dataset.i18nTip,
          shown: cs.content !== 'none',
          left,
          right: left + width,
          top: c.top + cb.clientTop + parseFloat(cs.top),
          iconBottom: el.getBoundingClientRect().bottom,
          panel: { left: panel.left, right: panel.right },
        };
      });
      const at = `${code}: ${r.key}`;
      expect(r.shown, at).toBe(true);
      expect(r.left, `${at} crosses the panel's left edge`).toBeGreaterThanOrEqual(r.panel.left);
      expect(r.right, `${at} crosses the panel's right edge`).toBeLessThanOrEqual(r.panel.right);
      expect(r.top, `${at} covers its icon`).toBeGreaterThanOrEqual(r.iconBottom);
    }
  }
});

test('starts empty: no cards, the drop zone, nothing to export; only Picture, Resolution, Export open @smoke', async ({
  page,
}) => {
  await expect(page.locator('.slot')).toHaveCount(0);
  await expect(page.locator('#drop')).toBeVisible();
  await expect(page.locator('#expAll')).toHaveText('Експортувати все (0)');
  await expect(page.locator('#expAll')).toBeDisabled();
  await expect(page.locator('#expOne')).toBeDisabled();
  await expect(page.locator('#rm')).toBeDisabled();
  await expect(page.locator('#replaceBtn')).toHaveClass(/off/);
  await expect(page.locator('#ttl')).toBeDisabled();
  for (const id of SECTIONS) expect(await isOpen(page, id), id).toBe(OPEN_BY_DEFAULT.includes(id));
});

test('fifteen numbered pictures, picked in any order, list 01 … 15 titled after their files (acceptance #1)', async ({
  page,
}) => {
  const files = TITLES.map((t, i) => ({ name: `${String(i + 1).padStart(2, '0')} ${t}.jpg`, w: 600, h: 800, color: '#c06040' }));
  await addGeneratedImages(page, [...files.slice(7), ...files.slice(0, 7).reverse()]);
  await expect(toast(page)).toHaveText('Додано: 15');
  expect(await rowNumbers(page)).toEqual(TITLES.map((_, i) => String(i + 1).padStart(2, '0')));
  expect(await rowTitles(page)).toEqual(TITLES);
  for (const st of await page.locator('.slot .st').all()) await expect(st).toContainText('dpi');
  await expect(page.locator('.slot.cur .t b')).toHaveText('Багрянці');
  await expect(page.locator('#ttl')).toHaveValue('Багрянці');
  await expect(page.locator('#expAll')).toHaveText('Експортувати все (15)');
});

test('pictures without a number follow the numbered ones; the same name again replaces its card', async ({ page }) => {
  await addGeneratedImages(page, [
    { name: 'Sunset.jpg', w: 600, h: 800, color: '#aa7733' },
    { name: '02 Простір.jpg', w: 600, h: 800, color: '#3377aa' },
    { name: '01 Багрянці.jpg', w: 600, h: 800, color: '#aa3333' },
  ]);
  await expect(toast(page)).toHaveText('Додано: 3');
  expect(await rowTitles(page)).toEqual(['Багрянці', 'Простір', 'Sunset']);
  expect(await rowNumbers(page)).toEqual(['01', '02', '']);

  await addGeneratedImages(page, [{ name: '02 Простір.png', w: 900, h: 1200, color: '#33aa77', type: 'image/png' }]);
  await expect(toast(page)).toHaveText('Замінено: 1');
  await expect(page.locator('.slot')).toHaveCount(3);
  await expect(page.locator('.slot.cur .t b')).toHaveText('Простір');
  await expect(page.locator('#pPx')).toHaveText('900 × 1200 px');
});

test('Remove takes the card off the list; the last one leaves the tool empty', async ({ page }) => {
  await addGeneratedImages(page, [
    { name: '01 Багрянці.jpg', w: 600, h: 800, color: '#aa3333' },
    { name: '02 Простір.jpg', w: 600, h: 800, color: '#3377aa' },
  ]);
  await expect(toast(page)).toHaveText('Додано: 2');
  await page.click('#rm');
  expect(await rowTitles(page)).toEqual(['Простір']);
  await expect(page.locator('.slot.cur .t b')).toHaveText('Простір');
  await page.click('#rm');
  await expect(page.locator('.slot')).toHaveCount(0);
  await expect(page.locator('#drop')).toBeVisible();
  await expect(page.locator('#expAll')).toHaveText('Експортувати все (0)');
});

test('TIFF input: Deflate, LZW and PackBits load in the built app', async ({ page }) => {
  const rgb = twoTone(120, 160, [200, 40, 40], [40, 40, 200]);
  await page.setInputFiles('#files', [
    { name: '01 deflate.tif', mimeType: 'image/tiff', buffer: tiffFixture(120, 160, rgb, 'deflate') },
    { name: '02 lzw.tiff', mimeType: 'image/tiff', buffer: tiffFixture(120, 160, rgb, 'lzw') },
    // An empty MIME type, as browsers often report for TIFF: detected by extension.
    { name: '03 packbits.tif', mimeType: '', buffer: tiffFixture(120, 160, rgb, 'packbits') },
  ]);
  await expect(toast(page)).toHaveText('Додано: 3');
  expect(await rowTitles(page)).toEqual(['deflate', 'lzw', 'packbits']);
  await expect(page.locator('#pPx')).toHaveText('120 × 160 px');
  for (const st of await page.locator('.slot .st').all()) await expect(st).toContainText('dpi');
});

test('export: front and back TIFFs at 1287 × 1795 px, 300 dpi, no overlays (acceptance #4) @smoke', async ({
  page,
  browserName,
}) => {
  // Taller than the 2400 px preview limit, so the preview downscale path runs in every engine.
  await addGeneratedImages(page, [{ name: '01 test.png', w: 1950, h: 2600, color: '#3366cc', type: 'image/png' }]);
  await expect(toast(page)).toHaveText('Додано: 1');
  await openSection(page, 'secCard');
  await page.click('#fMargin');
  await expect(page.locator('#placed')).toHaveText('Розмір 89.0 × 118.7 мм');

  const [front, back] = await nextDownloads(page, 2, () => page.click('#expOne'));
  expect(savedNames('01 test - front.tiff', browserName)).toContain(front.suggestedFilename());
  expect(savedNames('01 test - back.tiff', browserName)).toContain(back.suggestedFilename());

  const f = await decodeDownload(front);
  expect([f.w, f.h]).toEqual([1287, 1795]);
  expect(f.ifd.t259).toEqual([32773]);
  expect(f.ifd.t262).toEqual([2]);
  expect(f.ifd.t277).toEqual([3]);
  expect(f.ifd.t282).toEqual([300]);
  expect(f.ifd.t296).toEqual([2]);
  // Side margins: white around the picture; the bleed tint and trim line are preview-only.
  for (const [x, y] of [
    [5, 5],
    [1281, 5],
    [5, 1789],
    [1281, 1789],
    [24, 900], // inside the bleed, where the preview draws a tint
  ])
    expectColor(pixel(f, x, y), [255, 255, 255], 0);
  expectColor(pixel(f, 643, 1100), [0x33, 0x66, 0xcc], 1);

  const b = await decodeDownload(back);
  expect([b.w, b.h]).toEqual([1287, 1795]);
  expectColor(pixel(b, 5, 5), [255, 255, 255], 0);
  expect(ink(b, ...NAME_BOX), 'the name and title are drawn near the top left').toBeGreaterThan(500);
  expect(ink(b, ...SITE_BOX), 'the website is drawn near the bottom left').toBeGreaterThan(100);
});

test('export all asks first when cards are under 300 dpi, then exports fronts and backs', async ({ page }) => {
  await addGeneratedImages(page, [
    { name: '01 Багрянці.jpg', w: 300, h: 400, color: '#884422' },
    { name: '02 У затінку саду.jpg', w: 300, h: 400, color: '#228844' },
  ]);
  await expect(toast(page)).toHaveText('Додано: 2');
  let asked = '';
  page.once('dialog', (d) => {
    asked = d.message();
    void d.accept();
  });
  const files = await nextDownloads(page, 4, () => page.click('#expAll'));
  expect(asked).toBe('Листівок із роздільністю менше 300 dpi: 2 (01, 02). Все одно експортувати?');
  expect(files.map((d) => d.suggestedFilename()).sort()).toEqual([
    '01 Багрянці - back.tiff',
    '01 Багрянці - front.tiff',
    '02 У затінку саду - back.tiff',
    '02 У затінку саду - front.tiff',
  ]);
  await expect(toast(page)).toHaveText('Експортовано файлів: 2 лицьових + звороти');
  await expect(page.locator('#expAll')).toHaveText('Експортувати все (2)');
});

test('a manual placement stays put when the fit mode changes (acceptance #5)', async ({ page }) => {
  await addGeneratedImages(page, [
    { name: '01 A.jpg', w: 1500, h: 2000, color: '#aa5533' },
    { name: '02 B.jpg', w: 1500, h: 2000, color: '#3355aa' },
  ]);
  await expect(toast(page)).toHaveText('Додано: 2');

  // Card 01 goes manual by dragging; card 02 stays auto.
  const box = (await page.locator('#front').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 25, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('#mMan')).toHaveClass(/on/);
  const placedManual = await page.locator('#placed').textContent();
  const dx = await page.locator('#dx').inputValue();

  await openSection(page, 'secCard');
  await page.click('#fMargin');
  await expect(page.locator('#placed')).toHaveText(placedManual!);
  await expect(page.locator('#dx')).toHaveValue(dx);

  await page.keyboard.press('PageDown');
  await expect(page.locator('#placed')).toHaveText('Розмір 89.0 × 118.7 мм');
});

test('Top & side margins: 10 mm of white from the trim line at the top and sides, the rest at the bottom', async ({
  page,
}) => {
  await addGeneratedImages(page, [{ name: '01 test.png', w: 1500, h: 2000, color: '#3366cc', type: 'image/png' }]);
  await expect(toast(page)).toHaveText('Додано: 1');
  await openSection(page, 'secCard');
  await page.click('#fFrame');
  await expect(page.locator('#fFrame')).toHaveClass(/on/);
  await expect(page.locator('#fTrim')).not.toHaveClass(/on/);
  // The Side margins field plays no part here.
  await expect(page.locator('#mg')).toBeDisabled();
  await expect(page.locator('#placed')).toHaveText('Розмір 85.0 × 113.3 мм');
  await expect(page.locator('#trimNote')).toHaveText('Обріз 105.0 × 148.0 мм · видиме бічне поле після обрізу 10.0 мм');

  const [front] = await nextDownloads(page, 1, async () => {
    await page.uncheck('#withBack');
    await page.click('#expOne');
  });
  const f = await decodeDownload(front);
  // 11.807 px per mm. The picture spans 12…97 mm across and 12…125.3 mm down (2 mm bleed + 10 mm).
  const px = (mm: number) => Math.round((mm * 1287) / 109);
  for (const [x, y] of [
    [px(11), px(60)], // left of the picture
    [px(98), px(60)], // right of it
    [px(54.5), px(11)], // above it
    [px(54.5), px(127)], // below it: the bottom keeps the rest
    [px(54.5), px(148)],
  ])
    expectColor(pixel(f, x, y), [255, 255, 255], 0);
  // The generated picture's darker top band starts right at 12 mm: the whole picture is there, nothing cut off.
  const band: [number, number, number] = [33, 66, 133];
  expectColor(pixel(f, px(13), px(13)), band, 1);
  expectColor(pixel(f, px(96), px(13)), band, 1);
  expectColor(pixel(f, px(54.5), px(124)), [0x33, 0x66, 0xcc], 1);

  // The bleed moves the trim line, and the picture with it.
  await page.fill('#bl', '3');
  await page.press('#bl', 'Enter');
  await expect(page.locator('#placed')).toHaveText('Розмір 83.0 × 110.7 мм');
});

test('a guide line that would disappear into the picture gets a light casing; turned off, the casing goes too', async ({
  page,
}) => {
  // The picture is the trim line's own red: without a casing, the line can't be seen at all.
  await addGeneratedImages(page, [{ name: '01 red.png', w: 1500, h: 2000, color: '#b2463a', type: 'image/png' }]);
  await expect(toast(page)).toHaveText('Додано: 1');
  const box = (await page.locator('#front').boundingBox())!;
  const k = box.width / 109;
  // The left trim line is drawn 0.5 px inside 2 mm; its casing reaches 1.5 px to each side.
  const x = 2 * k + 0.5 - 1;
  const y = box.height / 2;
  const cased = await stagePixel(page, x, y);
  for (const c of cased) expect(c, `casing ${cased}`).toBeGreaterThan(220);
  await openSection(page, 'secShow');
  await page.uncheck('#oTrim');
  const bare = await stagePixel(page, x, y);
  expect(bare[0] - bare[2], `the picture's red under the bleed tint: ${bare}`).toBeGreaterThan(80);
});

test('the view zooms with the wheel beside the card and with the corner controls; the picture stays put', async ({
  page,
}) => {
  await addGeneratedImages(page, [{ name: '01 A.jpg', w: 1500, h: 2000, color: '#557799' }]);
  await expect(toast(page)).toHaveText('Додано: 1');
  await expect(page.locator('#zVal')).toHaveText('100%');
  await expect(page.locator('#zFit')).toBeDisabled();
  await expect(page.locator('#view')).not.toHaveClass(/pan/);
  const placed = await page.locator('#placed').textContent();
  const fit = (await page.locator('#front').boundingBox())!;

  // Beside the card, to its right: the wheel zooms the view around that point.
  const x = fit.x + fit.width + 20;
  const y = fit.y + fit.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, -100);
  await expect(page.locator('#zVal')).toHaveText('116%');
  const zoomed = (await page.locator('#front').boundingBox())!;
  expect(zoomed.width / fit.width).toBeCloseTo(1.162, 2);
  // The point under the cursor (in card mm) is still under it.
  const u = (x - fit.x) / (fit.width / 109);
  expect(Math.abs(zoomed.x + u * (zoomed.width / 109) - x)).toBeLessThan(2);
  // The next notch of the same gesture zooms on, wherever the card has grown to.
  await page.mouse.wheel(0, -100);
  await expect(page.locator('#zVal')).toHaveText('135%');
  // Even when the gesture moves onto the card: until the wheel rests, it zooms the view, not the picture.
  const grown = (await page.locator('#front').boundingBox())!;
  await page.mouse.move(grown.x + grown.width / 2, grown.y + grown.height / 2);
  await page.mouse.wheel(0, -100);
  await expect(page.locator('#zVal')).toHaveText('157%');
  await expect(page.locator('#mAuto')).toHaveClass(/on/);
  await expect(page.locator('#placed')).toHaveText(placed!);

  await page.click('#zIn');
  await expect(page.locator('#zVal')).toHaveText('200%');
  await page.click('#zOut');
  await expect(page.locator('#zVal')).toHaveText('150%');

  // A drag beside the card pans the zoomed view.
  await expect(page.locator('#view')).toHaveClass(/pan/);
  const before = await page.locator('#view').evaluate((v) => [v.scrollLeft, v.scrollTop]);
  const card = (await page.locator('#front').boundingBox())!;
  await page.mouse.move(card.x + card.width + 10, card.y + 100);
  await page.mouse.down();
  await page.mouse.move(card.x + card.width - 70, card.y + 40, { steps: 4 });
  await page.mouse.up();
  const after = await page.locator('#view').evaluate((v) => [v.scrollLeft, v.scrollTop]);
  expect(after[0] - before[0]).toBeCloseTo(80, 0);
  expect(after[1] - before[1]).toBeCloseTo(60, 0);
  await expect(page.locator('#mAuto')).toHaveClass(/on/);

  // Once the wheel has rested, over the card it scales the picture again.
  await page.waitForTimeout(500);
  const now = (await page.locator('#front').boundingBox())!;
  await page.mouse.move(now.x + now.width / 2, now.y + now.height / 2);
  await page.mouse.wheel(0, -100);
  await expect(page.locator('#mMan')).toHaveClass(/on/);
  await expect(page.locator('#zVal')).toHaveText('150%');

  await page.click('#zFit');
  await expect(page.locator('#zVal')).toHaveText('100%');
  expect((await page.locator('#front').boundingBox())!.width).toBeCloseTo(fit.width, 0);
  await expect(page.locator('#view')).not.toHaveClass(/pan/);
});

test('the work is kept in the browser: a reload brings back the cards, titles, placements and settings', async ({
  page,
}) => {
  await addGeneratedImages(page, [
    { name: '01 A.png', w: 1500, h: 2000, color: '#aa5533', type: 'image/png' },
    { name: '02 B.png', w: 1600, h: 2000, color: '#3355aa', type: 'image/png' },
  ]);
  await expect(toast(page)).toHaveText('Додано: 2');
  await openSection(page, 'secCard');
  await page.click('#fFrame');
  await page.keyboard.press('PageDown');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await openSection(page, 'secTitle');
  await page.fill('#ttl', 'B, нова');
  await page.uncheck('#withBack');
  await saved(page);
  const [before] = await nextDownloads(page, 1, () => page.click('#expOne'));

  await page.reload();
  await expect(toast(page)).toHaveText('Відновлено з минулого разу: 2');
  expect(await rowTitles(page)).toEqual(['A', 'B, нова']);
  await expect(page.locator('.slot.cur .t b')).toHaveText('B, нова');
  await expect(page.locator('#fFrame')).toHaveClass(/on/);
  await expect(page.locator('#mMan')).toHaveClass(/on/);
  await expect(page.locator('#dx')).toHaveValue('1');
  await expect(page.locator('#withBack')).not.toBeChecked();
  // The picture came back byte for byte: the export is the same file.
  const [after] = await nextDownloads(page, 1, () => page.click('#expOne'));
  expect(after.suggestedFilename()).toBe('02 B нова - front.tiff');
  expect((await bytes(after)).equals(await bytes(before))).toBe(true);
});

test('a splash covers the page until the saved work is back, then fades out over the finished page', async ({
  page,
}) => {
  // A first visit: nothing to restore, so it goes at once and the page takes input.
  await expect(page.locator('#splash')).toHaveCount(0);
  expect(await page.evaluate(() => document.querySelector('header')!.inert || document.querySelector('main')!.inert)).toBe(
    false,
  );
  await addGeneratedImages(page, [
    { name: '01 A.jpg', w: 1500, h: 2000, color: '#aa5533' },
    { name: '02 B.jpg', w: 1500, h: 2000, color: '#3355aa' },
  ]);
  await expect(toast(page)).toHaveText('Додано: 2');
  await page.keyboard.press('PageDown');
  await saved(page);

  // On the reload, note what the page holds when the splash goes, and what the splash said last. Each picture takes
  // 300 ms longer to decode, so the restore outlasts the fonts and the first frames.
  await page.addInitScript(() => {
    const decode = window.createImageBitmap.bind(window);
    window.createImageBitmap = ((...a: Parameters<typeof decode>) =>
      new Promise((r) => setTimeout(r, 300)).then(() => decode(...a))) as typeof decode;
    const w = window as unknown as { splashSaw?: Record<string, unknown> };
    let seen = false;
    let text = '';
    let faded = false;
    const watch = new MutationObserver(() => {
      const splash = document.getElementById('splash');
      if (splash) {
        seen = true;
        text = document.getElementById('splashText')?.textContent || text;
        faded = splash.classList.contains('out');
        return;
      }
      if (!seen) return;
      w.splashSaw = {
        cards: document.querySelectorAll('.slot').length,
        cur: document.querySelector('.slot.cur .t b')?.textContent,
        text,
        faded,
      };
      watch.disconnect();
    });
    watch.observe(document, { childList: true, subtree: true, characterData: true, attributes: true });
  });
  await page.reload();
  await expect(page.locator('#splash')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { splashSaw?: unknown }).splashSaw)).toEqual({
    cards: 2,
    cur: 'B',
    text: 'Відновлюю роботу: 2 з 2',
    faded: true,
  });
  await expect(toast(page)).toHaveText('Відновлено з минулого разу: 2');
});

test('Clear list asks first, then empties the list and what the browser kept; the settings stay', async ({ page }) => {
  await expect(page.locator('#listFoot')).toBeHidden();
  await addGeneratedImages(page, [
    { name: '01 A.jpg', w: 1500, h: 2000, color: '#aa5533' },
    { name: '02 B.jpg', w: 1500, h: 2000, color: '#3355aa' },
  ]);
  await expect(toast(page)).toHaveText('Додано: 2');
  await openSection(page, 'secCard');
  await page.click('#fFrame');
  await saved(page);

  let asked = '';
  page.once('dialog', (d) => {
    asked = d.message();
    void d.dismiss();
  });
  await page.click('#clearAll');
  expect(asked).toBe(
    'Очистити список? Листівок: 2. Інструмент забуде їхні картини, назви й розміщення; файли на вашому комп’ютері залишаться.',
  );
  await expect(page.locator('.slot')).toHaveCount(2);

  page.once('dialog', (d) => void d.accept());
  await page.click('#clearAll');
  await expect(page.locator('.slot')).toHaveCount(0);
  await expect(page.locator('#drop')).toBeVisible();
  await expect(page.locator('#listFoot')).toBeHidden();
  await saved(page);

  await page.reload();
  await saved(page);
  await expect(page.locator('.slot')).toHaveCount(0);
  await expect(page.locator('#drop')).toBeVisible();
  await expect(page.locator('#fFrame')).toHaveClass(/on/);
});

test('title edits rename the card and the export file; Reset brings back the file name', async ({ page }) => {
  await addGeneratedImages(page, [{ name: '05 Сосна. Пісня гірського вітру.jpg', w: 1500, h: 2000, color: '#777777' }]);
  await expect(toast(page)).toHaveText('Додано: 1');
  await openSection(page, 'secTitle');
  await page.fill('#ttl', 'Сосна, нова назва.');
  await expect(page.locator('.slot.cur .t b')).toHaveText('Сосна, нова назва.');
  const [front] = await nextDownloads(page, 1, async () => {
    await page.uncheck('#withBack');
    await page.click('#expOne');
  });
  expect(front.suggestedFilename()).toBe('05 Сосна нова назва - front.tiff');
  await page.click('#ttlReset');
  await expect(page.locator('.slot.cur .t b')).toHaveText('Сосна. Пісня гірського вітру');
});

test("the back's name and website: edited, remembered in the browser, an empty field left off", async ({ page }) => {
  await openSection(page, 'secBack');
  await expect(page.locator('#artist')).toHaveValue('ГАЙДАМАКА ОЛЯ');
  await expect(page.locator('#website')).toHaveValue('haydamaka.com');
  await page.fill('#artist', 'MARIA KOWALSKA');
  await page.fill('#website', '');

  await addGeneratedImages(page, [{ name: '01 Море.jpg', w: 1500, h: 2000, color: '#557799' }]);
  await expect(toast(page)).toHaveText('Додано: 1');
  const [, back] = await nextDownloads(page, 2, () => page.click('#expOne'));
  const b = await decodeDownload(back);
  expect(ink(b, ...NAME_BOX), 'name and title').toBeGreaterThan(500);
  expect(ink(b, ...SITE_BOX), 'no website').toBe(0);

  await page.reload();
  expect(await isOpen(page, 'secBack')).toBe(true);
  await expect(page.locator('#artist')).toHaveValue('MARIA KOWALSKA');
  await expect(page.locator('#website')).toHaveValue('');
});

test('the back side by side lines up with the front card', async ({ page }) => {
  await addGeneratedImages(page, [{ name: '01 test.jpg', w: 1500, h: 2000, color: '#aa5533' }]);
  await expect(toast(page)).toHaveText('Додано: 1');
  await openSection(page, 'secShow');
  await page.check('#oBack');
  const front = (await page.locator('#front').boundingBox())!;
  const back = (await page.locator('#back').boundingBox())!;
  expect(Math.abs(back.y - front.y), 'tops').toBeLessThan(1);
  expect(Math.abs(back.height - front.height), 'heights').toBeLessThan(1);
  expect(back.x).toBeGreaterThan(front.x + front.width);
});

test('sections fold from their headings and stay as the viewer left them', async ({ page }) => {
  await page.click('#secPicture > summary');
  await page.click('#secCard > summary');
  // The info circle in a heading shows its tip; it doesn't fold the section.
  await page.click('#secResolution > summary .info');
  expect(await isOpen(page, 'secResolution')).toBe(true);
  await page.reload();
  expect(await isOpen(page, 'secPicture')).toBe(false);
  expect(await isOpen(page, 'secCard')).toBe(true);
  expect(await isOpen(page, 'secResolution')).toBe(true);
});
