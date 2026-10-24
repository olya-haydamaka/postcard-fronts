# Postcard fronts

A browser-only tool for preparing postcards for a print studio. Drop in your paintings; each one is placed on a
109 × 152 mm card (auto-fit, with manual adjustment), checked for bleed, trim and resolution, and exported as
print-ready 300 dpi TIFF files for the front and the back.

**Nothing leaves your computer.** There is no backend, no account and no upload: pictures are decoded and exported
inside the browser tab. The page loads no third-party resources (fonts are self-hosted) and ships with a strict
Content-Security-Policy. Your work is kept in the browser's own storage on this computer, so a reload or a closed tab
loses nothing; **Clear list** removes it.

Live at **[postcards.haydamaka.com](https://postcards.haydamaka.com)**. Made for the artist
[Olya Haydamaka](https://haydamaka.com): the back starts with her name and website, and anyone can type their own.

## Output

| | |
| --- | --- |
| File | 109 × 152 mm at 300 dpi → **1287 × 1795 px**, bleed included |
| Format | TIFF, RGB 8-bit, PackBits, 300 dpi, white background |
| Bleed | 2 mm per side by default (trim 105 × 148 mm); affects guides only, never the file size |
| Names | `01 Багрянці - front.tiff`, `01 Багрянці - back.tiff`: the card's number and title (`.` and `,` removed) |

## Using it

1. **Add pictures** (TIFF, JPG, PNG or WebP), or drop them anywhere on the window. Each picture becomes a card
   titled after its file name: `01 Багрянці.tiff` is card 01, «Багрянці». The leading number sets the order;
   pictures without one go last, in the order added. The same file name again replaces that card's picture, and so
   does a file dropped on a card's row or **Replace**.
2. **Auto-fit** places every picture. *Fill card* covers the card, anchored to the top (overflow is cropped at the
   bottom or the sides). *Side margins* fits the whole picture inside a white margin. *Top & side margins* leaves
   10 mm of white from the trim line at the top, left and right, and the bottom keeps whatever is left (at least
   10 mm, so a picture too tall for that gets smaller).
3. **Adjust** a card by hand when needed: drag (snaps to edges, trim, safe zone, margins and centre; hold Alt to
   skip), scroll or `−`/`+` to scale, arrows to nudge 0.5 mm (Shift: 2 mm), double-click to centre horizontally,
   PgUp/PgDn to switch cards. A manual card keeps its placement when the card-wide settings change.
   **Zoom the view** to check an edge or a detail: scroll beside the card (it zooms around the cursor), or use
   − / + / Fit in the stage's bottom right corner, 50–400 %. Once zoomed in, drag beside the card to move around.
   The guide lines keep their colours; where a picture would hide one, it gets a light or dark edge underneath,
   chosen from the picture's own colours.
4. Watch **Resolution**: 300 dpi or more is good for print; 200–299 may look soft; below 200 looks blurry.
5. **Export this card** or **Export all**. The back (name, «title», website) is exported alongside unless you turn
   it off. Titles can be edited per card; edits rename the files. The name and website are the same on every back:
   set them under **Back**. The browser remembers them, and an empty field is left off the card.

**Your work is kept in this browser.** The pictures (the original files, byte for byte), titles, placements and
settings come back after a reload or the next day, with the card you were on selected. **Clear list**, under the
cards, asks first and then removes every card and what the browser kept of them; the settings stay. A private window
forgets everything when it closes. While the work comes back, a splash screen shows the progress.

The interface comes in the seven languages of [haydamaka.com](https://haydamaka.com): Ukrainian (the default),
English, Polish, German, Japanese, Spanish and French. The panel's sections fold: Picture, Resolution and Export
start open. The browser remembers the language and which sections you open or close.

### Known limits

- Output is RGB with no embedded colour profile (read as sRGB). If the studio needs CMYK, convert in Photoshop with
  the studio's profile; a browser can't apply ICC profiles reliably.
- TIFF input is decoded with UTIF.js, which ignores embedded profiles (an Adobe RGB scan will look flatter); JPEG,
  PNG and WebP are colour-managed by the browser.
- The on-screen preview uses a copy capped at 2400 px, so it looks softer than the export above roughly 1.2× scale.
  Export always re-reads the original file at full resolution. If the file changed on disk after you added it, that
  card is skipped with a message; add it again.
- Export all saves files one by one; the browser may ask once to allow multiple downloads.
- The kept pictures take the browser's storage (IndexedDB) as well as the disk space they already use. If the
  browser has no more room, the tool says so and keeps working, and warns before a reload would lose a picture.
- The back's font, Cormorant Garamond, covers Latin and Cyrillic (Vietnamese too). A title or name in another
  script, such as Japanese, prints in the computer's own serif font, so that back can look different on another
  computer.
- Desktop browsers: current Chrome, Edge, Firefox and Safari.

## Develop

Requires Node 22.12+.

The quickest way to run it is one script, which checks Node, installs the dependencies when they are missing or
out of date, and starts the site:

```bash
bash scripts/run-local.sh              # dev server with hot reload, http://localhost:5173
bash scripts/run-local.sh prod         # production build with its real headers (CSP), http://localhost:8787
bash scripts/run-local.sh --lan        # also open it from a phone or another computer on the network
```

On Windows, `.\scripts\run-local.ps1` takes the same options (`prod`, `-Lan`, `-Port 3000`). If scripts are
blocked, run `powershell -ExecutionPolicy Bypass -File scripts\run-local.ps1`. Or use npm directly:

```bash
npm install
npm run dev          # http://localhost:5173 (add -- --host to reach it from the LAN)
npm run check        # lint + typecheck + unit tests
npm run e2e          # production build + Playwright (Chromium, WebKit smoke) against `wrangler dev`
npm run build        # dist/
```

- **Unit tests** (Vitest) pin the geometry, snapping, titles and numbers from file names, the card list's order,
  export file names, the TIFF encoder and every UI string. Several compare against the design prototype in
  [`docs/prototype/`](docs/prototype/) directly: the TIFF encoder must stay byte-identical to the prototype's, and
  the translations must match its copy, apart from the deliberate changes listed in the test.
- **End-to-end tests** (Playwright) run against the built site with its real headers, so a CSP violation fails
  them. `E2E_BASE_URL=http://127.0.0.1:5173 npx playwright test --project=chromium` runs them against the dev server.
- **Stress test:** `STRESS=1 npm run e2e` loads and exports fifteen ~40 MP pictures and reports the longest
  main-thread tasks (opt-in; slow and memory-hungry).
- **Changelog:** every commit adds an entry to [`changelog/`](changelog/README.md), `NNN-YYYY-MM-DD-slug.md`, saying
  what changed and why, and bumps the version in `package.json`.

### Layout

```
src/config/      card format (mm, dpi, bleed) and the preset: the back's starting name and website
src/geometry/    auto-fit, manual placement, snapping, stage scale (pure, unit-tested)
src/render/      front, cropped-preview ghost, overlays (and their casings), back (option G)
src/io/          decoding (TIFF in a worker), title + number from file names, TIFF encoder, download
src/i18n/        en.ts (the typed source) + uk, pl, de, ja, es, fr; the compiler enforces key parity
src/state/       the cards and settings; saved.ts keeps the work in IndexedDB
src/ui/          card list, stage and its zoom, panel and its folding sections, actions (load/restore/export),
                 autosave, global bindings
docs/spec.md     the design specification this implements (placeholder titles), docs/prototype/ its prototypes
changelog/       one entry per commit: what changed and why
```

### Adapting it

- **Your name and website:** type them under **Back** in the tool, or change the starting values in
  [`src/config/preset.ts`](src/config/preset.ts) for everyone who opens your copy. Titles come from file names.
- **Another white for Top & side margins:** `frameMm` in the same file. The auto-fit tooltip names 10 mm in every
  language; change it there too.
- **Another language:** add a dictionary next to [`src/i18n/uk.ts`](src/i18n/uk.ts) and register it, with its
  name, in `src/i18n/index.ts`; the language menu is built from that list. Add its `og:locale:alternate` to
  `index.html` (a test checks the two agree).
- **Link previews:** `index.html` carries the title, description and preview image that search results and
  messengers show, in Ukrainian. Change them there, and the domain in `wrangler.jsonc` with them. The image,
  `public/og.png`, is drawn by `node scripts/og-image.mjs`; run it again after changing its copy.
- **Another card size:** add a format in [`src/config/format.ts`](src/config/format.ts). (Some tooltip copy names
  109 × 152 mm.)

## Deploy

The site is a static build (`vite base: './'`, so the same `dist/` works at any path) served by an assets-only
Cloudflare Worker on a custom domain ([`wrangler.jsonc`](wrangler.jsonc)); security and cache headers live in
[`public/_headers`](public/_headers).

[CI](.github/workflows/ci.yml) runs the checks and the end-to-end tests on every push and pull request. It deploys
the tested build only from `main`, when the pushed head commit's message contains `[deploy]`, or from the
"Run workflow" button.

One-time setup (Cloudflare dashboard, then GitHub):

1. Create an API token from the **Edit Cloudflare Workers** template, scoped to the account and the zone that holds
   the domain. The custom-domain route is applied on every deploy, so the token keeps those rights. If attaching
   the domain is refused, add **Zone → DNS → Edit**.
2. Add repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
3. Make sure no DNS record exists yet for the hostname. Cloudflare creates it, and the certificate, on first deploy.
4. Keep Rocket Loader and automatic Web Analytics injection off for the zone; both would break the CSP.

## Credits

- Design and paintings: Olya Haydamaka. The paintings are not part of this repository.
- [UTIF.js](https://github.com/photopea/UTIF.js) (MIT) and [pako](https://github.com/nodeca/pako) (MIT and Zlib)
  for TIFF input.
- Fonts: Cormorant Garamond and JetBrains Mono (SIL Open Font License), via [Fontsource](https://fontsource.org).

## License

[MIT](LICENSE).
