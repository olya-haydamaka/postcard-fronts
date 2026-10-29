# 008 — The Ukrainian name: «Листівки»

**Date:** 2026-10-30
**Version:** 26.10.7
**Follows:** 007-2026-10-29-empty-state-and-sample.md

## What changed

- In Ukrainian the tool is called **«Листівки»**, not «Лицьовий бік листівок»: the header, the page title, and the
  link preview's title and image. The other languages keep their names.
- The link-preview image (`public/og.png`, drawn by `scripts/og-image.mjs`) shows the new name, and its drawn back
  shows the tool's placeholders, ARTIST NAME and example.com, in place of the artist's name and website.

## Why

- The owner asked for the name the organisation's site (olya-haydamaka.github.io) gives the tool, so both say the
  same.
- The preview's back still showed the old starting text after changelog 005 made it placeholders. A preview should
  show what the tool shows.

## Details

- **Another change to the prototype's copy:** `h1` joins the changed entries in `tests/i18n.test.ts`. The design
  documents in `docs/` keep the old name.
- The page head and the dictionary stay tied by `tests/head.test.ts` (title and `og:title` equal `uk.h1`).

## Verification

- `npm run check` passes (79 unit tests); all 26 end-to-end tests pass (Chromium + WebKit). The language test checks
  the new header.
- The regenerated preview looked at: 1200 × 630, the new name on one line, the back with the placeholders, no
  metadata chunks in the PNG.
