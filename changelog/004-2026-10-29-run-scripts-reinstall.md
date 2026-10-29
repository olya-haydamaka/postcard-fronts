# 004 — Run scripts reinstall only when dependencies change

**Date:** 2026-10-29
**Version:** 26.10.3
**Follows:** 003-2026-10-29-source-link-and-https.md

## What changed

- `scripts/run-local.sh` and `scripts/run-local.ps1` run `npm ci` only when `node_modules` doesn't match
  `package-lock.json`, leaving out the lockfile's own version. The check is `scripts/deps.mjs`: it fingerprints the
  lockfile, and after `npm ci` records the fingerprint in `node_modules/.run-local-deps`.
- When `npm ci` fails, both scripts say what EPERM or EBUSY means: a running dev server, preview or test run of
  this project still has a file in `node_modules` open.
- ESLint treats `scripts/` as Node code, like the tests.

## Why

- The owner's `run-local.ps1` failed with `EPERM ... unlink ... rolldown-binding.win32-x64-msvc.node`. Two things
  met:
  - The scripts reinstalled whenever `package-lock.json` was newer than the last install. Every commit's version
    bump rewrites the lockfile without changing a dependency, so the first run after each commit reinstalled
    everything.
  - `npm ci` deletes `node_modules` first, and Windows refuses to delete a native module that a running process has
    loaded. Here it was a `vite preview` left running after a check. The failed run had already deleted most of
    `node_modules`.
- Comparing the dependencies themselves keeps the install for every real change: a new, removed or updated package,
  a fresh clone. It drops it for a version bump.

## Verification

- `scripts/deps.mjs` on a copy of the lockfile: a fresh clone needs an install, an install by hand without the record
  needs one, after `npm ci` + the record it doesn't, a version bump alone doesn't, one dependency's version changed
  does, npm's own record missing does.
- `run-local.ps1`, run as the owner runs it, three times: the first run installed (no record yet) and started Vite;
  the second didn't install; after `npm version 26.10.3` it still didn't. `run-local.sh` didn't install either.
  `bash -n` passes, and the `.ps1` is still ASCII.
- The owner's failure reproduced on purpose, with a Vite server holding the file and the record removed: `npm ci`
  failed with the same EPERM, and the script ended with the new explanation. `node_modules` was restored afterwards.
