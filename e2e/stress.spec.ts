import { expect, test } from '@playwright/test';
import { nextDownloads, toast } from './helpers';

/**
 * Acceptance #9: fifteen ~40 MP pictures load and export without freezing the tab. Opt-in (slow, memory-hungry):
 *   STRESS=1 npm run e2e
 * Reports the longest main-thread tasks while loading and while exporting.
 */
test('15 pictures of ~40 MP load and export without freezing the tab @stress', async ({ page }) => {
  await page.goto('/');
  const W = 7300;
  const H = 5475; // 40 MP, 3:4-ish

  // Generate the pictures in the page first (this part is test set-up, not measured).
  await page.evaluate(
    async ({ w, h }) => {
      const files: File[] = [];
      for (let i = 0; i < 15; i++) {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const c = canvas.getContext('2d')!;
        const g = c.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, `hsl(${i * 24} 70% 45%)`);
        g.addColorStop(1, `hsl(${i * 24 + 90} 60% 70%)`);
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
        c.fillStyle = '#000';
        c.font = '600px serif';
        c.fillText(String(i + 1), w / 3, h / 2);
        const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/jpeg', 0.9));
        files.push(new File([blob], `${String(i + 1).padStart(2, '0')} stress.jpg`, { type: 'image/jpeg' }));
        canvas.width = canvas.height = 1; // free the 160 MB backing store
      }
      (window as unknown as { __files: File[] }).__files = files;
    },
    { w: W, h: H },
  );

  await page.evaluate(() => {
    const win = window as unknown as { __long: number[]; __files: File[] };
    win.__long = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) win.__long.push(Math.round(e.duration));
    }).observe({ type: 'longtask' });
    const dt = new DataTransfer();
    win.__files.forEach((f) => dt.items.add(f));
    const input = document.getElementById('files') as HTMLInputElement;
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const t0 = Date.now();
  await expect(toast(page)).toHaveText('Додано: 15', { timeout: 5 * 60_000 });
  const loadMs = Date.now() - t0;
  const loadLong = await page.evaluate(() => (window as unknown as { __long: number[] }).__long.splice(0));

  const t1 = Date.now();
  const files = await nextDownloads(page, 30, () => page.click('#expAll'));
  await expect(toast(page)).toHaveText('Експортовано файлів: 15 лицьових + звороти', { timeout: 60_000 });
  const exportMs = Date.now() - t1;
  const exportLong = await page.evaluate(() => (window as unknown as { __long: number[] }).__long.splice(0));
  expect(files).toHaveLength(30);

  const stat = (xs: number[]) => ({ count: xs.length, max: Math.max(0, ...xs) });
  console.log(
    JSON.stringify({ loadMs, load: stat(loadLong), exportMs, exportPerCardMs: Math.round(exportMs / 15), export: stat(exportLong) }),
  );
  // "Without freezing": no single main-thread task anywhere near a second.
  expect(stat(loadLong).max).toBeLessThan(500);
  expect(stat(exportLong).max).toBeLessThan(1000);
});
