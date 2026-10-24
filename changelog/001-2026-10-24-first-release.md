# 001 — First release

**Date:** 2026-10-24
**Version:** 26.10.0

## What changed

The design prototype, rebuilt as a small open-source static app (Vite + TypeScript, no framework), to be hosted at
postcards.haydamaka.com.

- Cards come from the pictures you add: the title is the file name, a leading number sets the order
  (`01 Багрянці.tiff` → card 01, «Багрянці»), the same name again replaces that card's picture, and Remove takes a
  card off the list. The tool starts empty.
- Auto-fit (Fill card / Side margins / Top & side margins), manual placement with snapping, a blurred preview of
  the cropped area, bleed / trim / safe-zone overlays that stay visible on any picture, the back side by side.
- View zoom, 50–400 %: the wheel beside the card zooms around the cursor, − / + / Fit sit in the stage's corner, and
  a drag beside the card pans the zoomed view.
- The work is kept in the browser (IndexedDB): pictures byte for byte, titles, placements, the card-wide settings
  and the selected card come back after a reload. «Clear list» empties it.
- A splash screen while the page starts: a card with its trim line marching and, when there is saved work,
  «Restoring your work: 3 of 15». It fades out once everything is in place.
- Resolution check (effective dpi) per card and in the card list.
- Export of 1287 × 1795 px, 300 dpi RGB TIFF files (PackBits): one card or all, fronts and backs.
- The back's name and website can be edited (the same on every back; an empty field is left off) and are remembered
  in `localStorage`.
- The panel's sections fold. Picture, Resolution and Export start open; the viewer's choice is remembered.
- The haydamaka.com website's seven languages: Ukrainian (default), English, Polish, German, Japanese, Spanish
  and French. The choice is remembered in `localStorage`.
- Search results and link previews (Telegram, Facebook, X): a Ukrainian title and description, a canonical URL,
  Open Graph tags and a 1200 × 630 preview image drawn by `scripts/og-image.mjs`.
- `scripts/run-local.sh` and `scripts/run-local.ps1` run it locally in one step: the dev server, or the production
  build with its real headers, optionally open to the local network.
- This changelog folder: one entry per commit, with what changed and why (`changelog/README.md`).

## Why

- Olya Haydamaka prepares a series of postcards for a print studio, which needs 300 dpi TIFF files with bleed for
  the fronts and the backs. The design handoff came with a working one-file prototype; rebuilt as modules with
  tests, it can be maintained, reused by other artists (MIT licence) and published on its own subdomain.
- It runs entirely in the browser: the pictures are copyrighted paintings, and nothing has to leave the computer.
- The changes to the prototype were asked for by the owner while reviewing the tool, or fix what the prototype got
  wrong. Each one is listed below with its reason.
- The design documents copied into `docs/` (`spec.md` and the two prototypes) use placeholder titles. The series'
  real titles, some of them not yet on the website, show which paintings are in the coming postcard set and stay
  private. «Багрянці», the design's own example and a published painting, is kept.

## Details

### Where it differs from the prototype, on purpose

- **A manual card no longer follows card-wide changes.** In the prototype, switching the fit mode or the margin
  also resized manual cards. The spec's acceptance #5 says only auto cards re-fit, so a manual card now keeps the
  size it had when it turned manual. «Reset to auto» makes it follow the settings again.
- **The list is built from the files, not from 15 preset titles.** The prototype listed the preset's titles as
  empty slots and matched files to them by number, title or partial title. Now there are no empty slots: each file
  is a card titled after its name, ordered by its leading number. A file without a number is exported without one
  (`Sunset - front.tiff`). The empty-slot and matching copy went; the drop zone explains the new rule.
- **The back's name and website are editable**, in a new «Back · all slots» section. The prototype printed the
  preset's values.
- **Panel sections fold.** The prototype showed every section open.
- **A third auto-fit mode, Top & side margins.** 10 mm of white from the trim line at the top, left and right; the
  bottom keeps whatever is left. It never gets less than 10 mm, so a picture too tall for that gets smaller and its
  sides wider. Measured from the trim line, it follows the bleed; the Side margins field belongs to its own mode and
  is off in the other two. The preview's margin lines, snapping and the trim note follow the mode in use. The three
  mode buttons stand one under another, so the longer names fit in every language.
- **The back side by side lines up with the front card.** In the prototype it sat higher by the blurred surround's
  padding (14 mm at stage scale).
- **No sample picture.** The prototype loaded a painting at start; the tool now opens empty.
- **Seven languages instead of two.** The prototype has Ukrainian and English, and their copy stays as it was. The
  website's other five are added: Polish, German, Japanese, Spanish and French.
- **"Export this card" is translated.** The prototype showed it in English in the Ukrainian UI until the first export.
- **The «Auto-fit» info circle shows its "i".** It was empty in the prototype.
- **Info tooltips open whole.** In the prototype the panel cut off the left part of the side-margin and bleed
  tooltips (69 px) and of the Resolution heading's (6 px). Each tooltip now hangs from the right edge of its line, so
  it stays inside the panel.
- **Guide lines stay visible on any picture.** Over «Багрянці» the red trim line and the taupe margin lines
  disappeared into the orange. Each line keeps its colour and dash; where the picture under it would hide it, it gets
  a light or dark casing, 1 px each side. The tone is chosen from the picture's colours, measured on a copy of at
  most 600 px, never read back from the stage. On white paper nothing changes: a line needs only the contrast the
  design gives it there, and at most 3:1.
- **The view zooms, and the stage scrolls.** The prototype's stage was fixed. At 100 % the scale is now measured
  from the view, where the prototype estimated the room the caption and the hint leave (a long hint could push the
  card off the bottom). The hint sits at the bottom of the stage. Zoomed in, the view has room to scroll on every
  side, so the point under the cursor stays put; a wheel gesture keeps zooming until it rests, even once the card
  has grown under the cursor. Canvases are capped at 8 MP (the blurred surround at 2 MP), so 400 % on a high-dpi
  screen stays light.
- **The work is kept in the browser.** The prototype kept nothing and warned before every reload. Now the pictures
  (in IndexedDB; localStorage holds about 5 MB) and the cards come back, and the warning comes only while a picture
  is not stored yet. «Clear list» under the cards removes them, after a confirmation.
- **A splash screen covers the start.** Without it the page flickered on a reload: the English markup before the
  language was applied, the empty drop zone, then the restored cards one by one and the stage switching to the saved
  card. The splash is in the HTML, so it covers the first paint; the page under it is `inert` until it goes. It
  fades out (0.45 s, about none with reduced motion) once the work is restored, the fonts are in and the page has
  painted. It never stays up for good: 15 s without progress and it goes anyway. The styles are linked from the
  page head (`src/styles/index.css`) instead of imported from the script, so the development server doesn't paint
  the page unstyled first either, and the splash card's shapes carry their own colours, so it never shows black.
- **Large pictures don't stay in memory.** Each card keeps a preview of at most 2400 px. Export re-reads the
  original file at full resolution; the exported pixels are byte-identical to the prototype's.
- **TIFF decoding runs in a worker**, so a 40 MP TIFF never freezes the page.
- **Fonts are self-hosted**; the page makes no third-party requests and runs under a strict CSP.
- **Ctrl/Cmd shortcuts belong to the browser.** Ctrl + −/+ zooms the page instead of also scaling the picture.
- **Handlers are bound before fonts load**, so a file picked the instant the page opens is never lost.

### Stored in the browser

- `localStorage`: `haydamaka-postcard-lang` (the language), `haydamaka-postcard-back` (the back's name and website),
  `haydamaka-postcard-sections` (folded sections), `haydamaka-postcard-settings` (card-wide settings and the
  selected card).
- IndexedDB `haydamaka-postcard`, version 1: the stores `cards` (each card's record) and `files` (its original file).

## Verification

- Unit tests (75): the spec's geometry figures (acceptance #2, #3, #5) and Top & side margins' (bottom kept, a
  picture too tall for it, the bleed followed), snapping (#6), titles and numbers from file names, list order and
  replacement (#1), export file names, the TIFF encoder (byte-identical to the prototype's, including its worst
  case), every Ukrainian and English string against the prototype except the deliberate changes above; the five
  added languages for completeness and for the same figures as the English copy; the page head against the default
  language, the Worker's domain, the languages and the preview image; the first paint (the stylesheet linked in the
  head, never imported from the script; the splash first, its shapes coloured, the page under it inert); the guide
  casings (none on white paper, a light one over the orange painting, one-segment gaps bridged); the zoom steps and
  wheel factor; the stored cards and settings read back and checked.
- End-to-end tests (24) on the built site with its real headers: the empty start, 15 numbered pictures picked out of
  order (#1), unnumbered pictures and replacement by name, Remove, TIFF input in Deflate, LZW and PackBits, front +
  back export decoded and checked (#4), the low-dpi confirmation, manual placement across a fit-mode change (#5),
  Top & side margins exported with white where it belongs and the picture's top at 12 mm, language persistence (#8),
  every language labelling the whole page with no overflow, every info tooltip inside the panel and under its icon
  in every language, title edits, the back's name and website (edited, remembered, left off when empty), the back
  lined up with the front, folding sections remembered, a casing under a trim line drawn over a picture of its own
  colour, wheel and button zoom (the point under the cursor kept, the gesture lock, the pan, the picture untouched),
  the work restored after a reload (the export byte-identical to the one before), «Clear list» (dismissed, then
  accepted, then a reload), the splash (gone at once on a first visit; on a reload with decoding slowed, still up
  until every card is back, its last words «2 з 2», then faded); Chromium plus a WebKit smoke run.
- Each new safeguard was proven by breaking its fix on purpose: the test failed, and passed again once restored.
- Exports from the prototype and from the app, same painting and placements: byte-identical TIFFs.
- The first painted frames of a load and of rapid reloads, recorded in development and production: never unstyled.
- Stress, by hand on 2026-10-17: fifteen 40 MP pictures load in 6.6 s and export in 19 s; the longest main-thread
  task was 276 ms while loading and 430 ms while exporting (#9). That was before the work was kept in the browser.

## Open

- Re-run the stress test (`STRESS=1 npm run e2e`) on mains power: on battery the load limit failed (630–657 ms),
  and the browser storage has been added since.
- The Polish, German, Japanese, Spanish and French copy hasn't been read by a native speaker yet.
