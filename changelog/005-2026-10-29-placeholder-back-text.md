# 005 — Placeholder name and website on the back

**Date:** 2026-10-29
**Version:** 26.10.4
**Follows:** 004-2026-10-29-run-scripts-reinstall.md

## What changed

- The back starts with placeholders: **ARTIST NAME** and **example.com**, in place of the artist's own name and
  website (`src/config/preset.ts`). Anyone types their own under «Back», and the browser remembers it as before.

## Why

- The owner asked for abstract starting values. The tool is public, and every visitor's back showed one real
  person's name and website until they replaced them.
- `example.com` is reserved for examples (RFC 2606), so the placeholder is never somebody's site.
- One value for every language, in Latin capitals: the back text stays the same whatever the interface language
  (the preset's rule), and Latin reads everywhere. A placeholder per language was left out.

## Details

- **A browser that never had its own name typed** shows the placeholders after this update. Values are stored only
  once typed (`haydamaka-postcard-back`). The artist types her name and website once, and that browser keeps them.
- **Export parity with the prototype** (the manual check in `changelog/001`) now needs the prototype's name and
  website typed under «Back» first. The prototype prints its own.
- The page head's `og:site_name` stays the artist's: it names the site that hosts the tool.

## Verification

- End-to-end: the back test checks the placeholders as the starting values, then an edited name and an empty
  website, remembered across a reload. All 24 pass, Chromium + WebKit; `npm run check` passes (76 unit tests).
- The back preview looked at with the placeholders: ARTIST NAME, «title», example.com, in the design's places.
