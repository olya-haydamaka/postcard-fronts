# Changelog

One entry per commit. Every commit that changes the project (code, copy, styles, tests, docs, the build or the
deploy) carries an entry in this folder, written in the same commit. The entry says **what** changed and **why**, so
the history reads without the diffs.

## File name

`NNN-YYYY-MM-DD-slug.md`, for example `001-2026-10-24-first-release.md`.

- `NNN`: the next number, three digits, counting up from `001`. Never reused, never renumbered.
- `YYYY-MM-DD`: the day of the commit. Several commits on one day keep counting: `002-2026-10-24-…`,
  `003-2026-10-24-…`.
- `slug`: a few English words, lowercase, joined with hyphens: what the change is, not how it was done.

## Version

Each entry bumps the version in `package.json` in the same commit and states it. The scheme is `YY.M.PATCH`:
two-digit year, month without zero-padding, and a patch number that restarts at `0` each month (`26.10.0` →
`26.10.1`; the first change in November is `26.11.0`).

## What an entry holds

```markdown
# NNN — Title

**Date:** YYYY-MM-DD
**Version:** YY.M.PATCH
**Follows:** NNN-YYYY-MM-DD-slug.md (only when it continues or corrects an earlier entry)

## What changed

- What a user, or a reviewer, notices: behaviour, look, output files, tooling. One bullet per change.

## Why

- The reason for each change: the request, the problem it fixes (what went wrong, where, how it was found), or the
  decision taken and the alternative left out.

## Details

Optional. What a later change must know: deviations from the design prototype (`docs/prototype/`), stored data
(`localStorage` keys, the IndexedDB database), limits and traps.

## Verification

- How it was checked: unit and end-to-end tests (name the new ones), manual checks, measurements.
- What was not checked, and why.

## Open

Optional. Follow-ups this change leaves.
```

## Rules

- **Plain and short.** Readable in half a minute; details go under *Details*, not into *What changed*.
- **Never rewrite a past entry**, except typos and broken links. A later change gets its own entry, which names the
  earlier one under *Follows*.
- **Deliberate deviations from the design prototype** are recorded in the entry that makes them. The copy changes are
  also listed at the top of `tests/i18n.test.ts`.
- **Nothing private.** No personal email addresses, local paths, keys or tokens, and not the postcard series' real
  titles (the docs and tests use placeholders).
- **The commit message** is one line, `[Area] Description`. Add `[deploy]` to publish: CI deploys `main` only for a
  pushed head commit carrying it (or the "Run workflow" button).
