// Renders the link-preview image, public/og.png (1200 × 630), with Playwright's Chromium and the app's own fonts.
// Run it again after changing the copy or the look: node scripts/og-image.mjs
// The "picture" on the card is drawn here, on purpose: artwork never enters this repo.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'og.png');

/** A @fontsource stylesheet with its font files inlined, so the page needs no server. */
function inlineFonts(pkg, file) {
  const dir = join(root, 'node_modules', '@fontsource', pkg);
  return readFileSync(join(dir, file), 'utf8').replace(/url\(\.\/(files\/[^)]+\.woff2)\)/g, (_, f) => {
    const b64 = readFileSync(join(dir, f)).toString('base64');
    return `url(data:font/woff2;base64,${b64})`;
  });
}

// The card at the app's proportions: 109 × 152 mm, 2 mm bleed, safe zone 5 mm inside the trim.
const H = 440;
const K = H / 152; // px per mm
const W = 109 * K;
const mm = (v) => `${(v * K).toFixed(2)}px`;

const html = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><style>
${inlineFonts('cormorant-garamond', '500.css')}
${inlineFonts('cormorant-garamond', '400-italic.css')}
${inlineFonts('jetbrains-mono', '400.css')}
${inlineFonts('jetbrains-mono', '500.css')}
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; background: #efeae2; color: #2b241d; position: relative; overflow: hidden; }
.copy { position: absolute; left: 80px; top: 0; bottom: 0; width: 560px; display: flex; flex-direction: column;
  justify-content: center; gap: 28px; }
h1 { font: 500 84px/0.98 'Cormorant Garamond', serif; letter-spacing: -0.01em; }
.spec { font: 400 22px/1.4 'JetBrains Mono', monospace; color: #8a7862; }
.local { font: 400 21px/1.4 'JetBrains Mono', monospace; color: #5b4e3e; }
.url { position: absolute; left: 80px; bottom: 56px; font: 500 22px 'JetBrains Mono', monospace; color: #b5533a; }
.card { position: absolute; width: ${W}px; height: ${H}px; background: #fff;
  box-shadow: 0 1px 2px rgba(60, 40, 20, 0.12), 0 14px 40px rgba(60, 40, 20, 0.16); }
.back { left: 705px; top: 70px; transform: rotate(-4deg); }
.back .name { position: absolute; left: ${mm(10)}; top: ${mm(10)}; font: 500 ${mm(3.25)} 'Cormorant Garamond', serif;
  letter-spacing: 0.08em; color: #5b4e3e; }
.back .title { position: absolute; left: ${mm(10)}; top: ${mm(14.6)}; font: italic 400 ${mm(3.25)} 'Cormorant Garamond', serif;
  color: #8a7862; }
.back .site { position: absolute; left: ${mm(10)}; bottom: ${mm(9)}; font: italic 400 ${mm(3)} 'Cormorant Garamond', serif;
  color: #b5533a; }
.front { left: 830px; top: 108px; transform: rotate(3deg); overflow: hidden; }
/* The drawn "picture": a warm sky, a sun and three hills, covering the card with its bleed. */
.pic { position: absolute; inset: 0; background: linear-gradient(#f3e3dc 0%, #e9c9b4 52%, #d9a98c 100%); }
.sun { position: absolute; left: ${mm(62)}; top: ${mm(34)}; width: ${mm(22)}; height: ${mm(22)}; border-radius: 50%;
  background: #f6efe6; }
.hill { position: absolute; left: 0; right: 0; bottom: 0; }
.h1 { height: 52%; background: #c98a6c; clip-path: polygon(0 38%, 22% 18%, 48% 34%, 74% 8%, 100% 30%, 100% 100%, 0 100%); }
.h2 { height: 38%; background: #b5533a; clip-path: polygon(0 30%, 30% 6%, 58% 34%, 82% 20%, 100% 36%, 100% 100%, 0 100%); }
.h3 { height: 22%; background: #5b4e3e; clip-path: polygon(0 40%, 26% 22%, 52% 46%, 80% 14%, 100% 30%, 100% 100%, 0 100%); }
/* The app's overlays: bleed tint, red dashed trim, dotted safe zone. */
.bleed { position: absolute; inset: 0; border: ${mm(2)} solid rgba(181, 83, 58, 0.28); }
.trim { position: absolute; inset: ${mm(2)}; border: 2px dashed #b2463a; }
.safe { position: absolute; inset: ${mm(7)}; border: 2px dotted rgba(248, 245, 240, 0.85); }
</style></head><body>
<div class="copy">
  <h1>Листівки</h1>
  <div class="spec">109 × 152 мм · 300 dpi · RGB TIFF<br>лицьовий бік і зворот</div>
  <div class="local">Файли не залишають ваш комп’ютер.</div>
</div>
<div class="url">postcards.haydamaka.com</div>
<div class="card back">
  <div class="name">ARTIST NAME</div>
  <div class="title">«Назва листівки»</div>
  <div class="site">example.com</div>
</div>
<div class="card front">
  <div class="pic"></div><div class="sun"></div>
  <div class="hill h1"></div><div class="hill h2"></div><div class="hill h3"></div>
  <div class="bleed"></div><div class="trim"></div><div class="safe"></div>
</div>
</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out });
  console.log(`wrote ${out}`);
} finally {
  await browser.close();
}
