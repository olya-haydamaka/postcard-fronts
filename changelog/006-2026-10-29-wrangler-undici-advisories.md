# 006 — wrangler 4.153.0: undici advisories

**Date:** 2026-10-29
**Version:** 26.10.5
**Follows:** 005-2026-10-29-placeholder-back-text.md

## What changed

- `wrangler`, a development dependency, from 4.151.1 to 4.153.0. `npm audit` now finds no vulnerabilities (it found
  3 before: 1 high, 2 moderate).

## Why

- All three findings were one chain: `wrangler` → `miniflare` (its local Cloudflare simulator) → `undici` 7.29, an
  HTTP client with advisories fixed in 7.30.1. They include a TLS certificate check that custom options could drop,
  cache poisoning across redirects, and several denials of service (GHSA-2m5v-pch6-74hx, GHSA-4w7w-5xrc-9h26,
  GHSA-xjj6-f33q-929c, GHSA-qrxm-fqhp-jwvm and four moderate ones).
- None of it reaches the published site. `npm audit --omit=dev` found nothing, and the built files contain only the
  app, UTIF.js, pako and the fonts. The exposure was on machines running the tools: `wrangler dev` locally and in CI,
  and `wrangler deploy` in CI.
- 4.153.0 is the oldest release outside the vulnerable range (it was 3 days old). 4.154.0 and 4.155.0 carry the same
  `undici` 7.30.1. The oldest fixed release was taken over the newest one, which was a day old.

## Verification

- `npm audit`: 0 vulnerabilities. `npx wrangler --version`: 4.153.0.
- `npm run check` passes (76 unit tests). All 24 end-to-end tests pass on `wrangler dev` 4.153.0, Chromium + WebKit.
- `wrangler deploy --dry-run` reads the 54 files of `dist/` with no bindings, as before.
- Not checked: a real deploy with 4.153.0. The next `[deploy]` runs it.
