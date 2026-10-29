# 003 — Source link, HTTPS only

**Date:** 2026-10-29
**Version:** 26.10.2
**Follows:** 002-2026-10-26-webkit-linux-download-names.md

## What changed

- The header ends with the GitHub mark, linking to the source code in a new tab. Only the mark shows; its name and
  tooltip ("Source code on GitHub", «Вихідний код на GitHub») follow the language, in all seven.
- The site sends `Strict-Transport-Security: max-age=31536000`, so a browser that has opened it once stays on HTTPS.
- The README's Cloudflare setup now describes what the first deploy needed: the token's Workers policy on the
  account, a Configuration Rule that keeps Web Analytics off the page, and the HTTP → HTTPS redirect.

## Why

- The tool went live on 2026-10-29 at postcards.haydamaka.com from a public repository. The owner asked for a link
  to it in the app.
- The live check found the page served over plain `http://` with no redirect. The main site redirects in nginx,
  and the tool's Worker never reaches nginx. The redirect itself is a Cloudflare Redirect Rule for the hostname. The
  whole zone's Always Use HTTPS was left alone, because the main site renews its certificates over HTTP. The header
  covers the rest: browsers that visited haydamaka.com already stay on HTTPS (its `includeSubDomains`), and the tool
  now asks the same of everyone else.
- The first deploy was refused ("No access to the specified resource") until the token's Workers policy moved from
  the zone to the account. Cloudflare's Web Analytics is on by default for the zone and would inject a script that
  the CSP blocks, logging an error on every visit.

## Details

- **Another change to the prototype:** the source link, a new entry `source` in every dictionary (listed in
  `tests/i18n.test.ts`).
- The link sits after the language menu. The header stays one row at 1280 px in every language (measured), as at
  the suite's 1440 px.
- The mark is the Octicons `mark-github` path (MIT), coloured through `currentColor` as an attribute, like the
  splash's shapes.

## Verification

- New unit test (`tests/head.test.ts`): the link's address equals `repository` in `package.json`, opens in a new
  tab with `rel="noopener"`, and takes its name from the dictionary. Proven by pointing the link at a wrong
  repository: the test failed, then passed once restored.
- End-to-end: the languages test checks the link's name and tooltip in each language. All 24 pass, Chromium +
  WebKit; `npm run check` passes (76 unit tests).
- The live site before this change, 2026-10-29:
  - the security headers present, `/_headers` not served, assets cached for a year, DNS proxied;
  - no Cloudflare analytics script in the page;
  - the end-to-end suite run against it passed, 24 of 24;
  - a load, a picture added and one card exported made 11 requests, all to postcards.haydamaka.com, with no
    console message.
- Not yet checked: the HSTS header and the HTTP redirect live. They need this deploy and the owner's Redirect Rule.
