# 002 — CI: WebKit's Linux download names

**Date:** 2026-10-26
**Version:** 26.10.1
**Follows:** 001-2026-10-24-first-release.md

## What changed

- The end-to-end export test accepts, in WebKit only, the file name with its spaces turned into underscores
  (`01_test_-_front.tiff`). Chromium still has to save exactly `01 test - front.tiff`. The check is the new
  `savedNames` helper in `e2e/helpers.ts`. The app is unchanged.

## Why

- The first CI run failed on GitHub's Linux runner. WebKit's Linux build saves an `<a download>` file with every
  space replaced by an underscore. Cyrillic letters, commas and apostrophes are kept. Chromium on the same runner, and
  WebKit on Windows (where the suite was written), keep the name the page asked for.
- It is the engine, not the app: the page gives the same name to both browsers. A plain blob download, with no app
  code involved, comes out the same way in Playwright's Linux image.
- The WebKit run is a smoke test of the export path, which has no `OffscreenCanvas` there. The exact file names stay
  checked in Chromium and by the unit tests (`tests/filename.test.ts`).

## Verification

- Reproduced in `mcr.microsoft.com/playwright:v1.64.1-noble`, the version CI installs: the export test failed with
  the same message, `01_test_-_front.tiff`.
- A blob-download probe in the same image: Chromium kept `01 test - front.tiff` and `05 Сосна Пісня, д'ім -
  back.tiff`. WebKit saved them as `01_test_-_front.tiff` and `05_Сосна_Пісня,_д'ім_-_back.tiff`.
- With the change: the three WebKit smoke tests pass in that image, and all 24 end-to-end tests pass on Windows
  (Chromium + WebKit). `npm run check` passes (75 unit tests).
- Not checked: WebKit's macOS build. On macOS the helper accepts either name.
