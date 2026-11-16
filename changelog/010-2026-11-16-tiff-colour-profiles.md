# 010 — TIFF colours: the embedded profile is applied

**Date:** 2026-11-16
**Version:** 26.11.0

## What changed

- A TIFF's embedded colour profile is applied, on the stage and in the export. A CMYK TIFF now looks as Photoshop
  or Procreate show it, no longer much brighter and more saturated. An RGB TIFF with a wider profile (Adobe RGB,
  Display P3, ProPhoto…) no longer comes out flatter.
- Untagged TIFFs, and TIFFs with an sRGB profile, read exactly as before, byte for byte.
- A 16-bit CMYK TIFF without a profile now reads; it came out as noise.

## Why

- **The owner's report** ([#1](https://github.com/olya-haydamaka/postcard-fronts/issues/1)). A CMYK painting
  exported from Procreate, with Apple's Generic CMYK profile embedded, came out with dramatically different colours.
  - UTIF.js turns CMYK into RGB with a plain formula, (255 − C)(255 − K) / 255, and ignores the profile.
  - Against LittleCMS 2.17 with the embedded profile, the export was off by ΔE76 11.9 on average and 26 at most.
  - Pure cyan came out (0, 255, 255) instead of (0, 164, 219).
- **RGB too.** The same flaw left RGB profiles unapplied, which the README listed as a known limit; the same code
  fixes both.
- **No dependency.** The conversion is plain TypeScript in the TIFF worker. Left out:
  - LittleCMS compiled to WebAssembly: the CSP would need `'wasm-unsafe-eval'`, and it weighs far more.
  - A bundled CMYK profile for files saved without one: the common press profiles are copyrighted, and large.

## Details

### Where it differs from the prototype, on purpose

- The prototype, and `docs/spec.md` («TIFF: decode with UTIF.js … `UTIF.toRGBA8`»), read every TIFF with
  `UTIF.toRGBA8`. Now a usable embedded profile comes first; without one, it is `UTIF.toRGBA8` as in the prototype.
  The design documents keep the handoff's wording.

### How

- **`src/color/icc.ts` reads the profile.**
  - A CMYK profile: its perceptual table, A2B0 (`mft1` or `mft2`, PCS Lab or XYZ).
  - An RGB profile: its colourants and curves (`curv`, `para`).
  - Every size is checked before anything is read or allocated; a malformed profile gives null.
  - ICC v4 perceptual tables get the black point compensation LittleCMS forces for them.
- **`src/color/to-srgb.ts` converts**, fast enough for 40 MP:
  - CMYK: the profile is sampled into a 17⁴ device link and interpolated as LittleCMS's 8-bit path does: linear in
    C, tetrahedral over M, Y and K, with paper white fixed at 255.
  - Unlike LittleCMS, the link holds linear light, unclipped. Each pixel is clipped and encoded after the
    interpolation. Interpolating encoded values strays from the profile where a channel nears 0, in saturated colours
    at the gamut's edge. On the owner's painting this way stays within 1.0 level of the profile evaluated directly,
    where LittleCMS strays by up to 4.7.
  - RGB: exact per pixel, with curve tables, one matrix and a 64 KB encoding table.
  - A profile that is sRGB in all but rounding (colourants within 0.005, curves within half a level) is left alone.
    Converting HP's sRGB v2 would move some bytes by one level.
- **`src/io/tiff-pixels.ts` decides what to convert.** It is the worker's decoding, moved out of the worker so Node
  tests it.
  - Converted: CMYK (four inks) or RGB; 8 or 16 bits, unsigned, interleaved; at most one extra sample (alpha);
    complete data; a profile of the same colour space.
  - Everything else reads through `UTIF.toRGBA8`, unchanged.
  - 16-bit samples are read by their high byte, as UTIF reads 16-bit RGB.
- **Cost.**
  - About 1 s more per 16 MP TIFF, in the worker, so the page doesn't freeze.
  - 8.4 kB more in the worker chunk (3.8 kB gzip).
  - No more memory: the conversion replaces UTIF's RGBA buffer.
- **Kept from UTIF for untagged 8-bit CMYK:** the last pixel reads transparent (UTIF reads its alpha past the end of
  the data), so it exports white. Converted files are opaque.
- **Fixtures, not real profiles.** No real ICC profile is committed: they are copyrighted.
  - `tests/icc-fixture.ts` builds synthetic ones: a made-up press, an affine one, sRGB, Adobe RGB, Display P3,
    ProPhoto.
  - `tests/tiff-fixture.ts` writes the TIFFs: both byte orders, 8 and 16 bits, LZW and Deflate, the predictor,
    strips, a profile at an odd offset.
  - The LZW encoder moved there from `e2e/helpers.ts`.

## Verification

- **Unit tests, 44 new (124 in all).**
  - `icc.test.ts`:
    - the PCS encodings, and `curv` and `para` against their formulas;
    - the grid's order, checked with a linear table;
    - malformed profiles;
    - a fuzz (truncations, tags cut short, 2000 random byte flips) that never throws.
  - `to-srgb.test.ts`:
    - LittleCMS 2.17's numbers for five CMYK and four RGB profiles, within one level;
    - at the gamut edge, within two levels of the profile, where LittleCMS falls three or more short;
    - an affine press reproduced to the rounding at every value of every axis;
    - the v4 black; 16-bit samples and alpha; sRGB left alone.
  - `tiff-pixels.test.ts`:
    - untagged, sRGB and unhandled files byte-identical to `UTIF.toRGBA8`;
    - a file shaped like the owner's converted: MM, LZW, the predictor, a short last strip, the profile at an odd
      offset;
    - 16-bit in both byte orders, with and without the predictor; alpha.
- **End-to-end, 28** (Chromium + WebKit smoke), with one new test in both. It checks that:
  - a profiled CMYK TIFF previews and exports in the profile's colour;
  - the same file untagged exports in UTIF's colour;
  - an sRGB-tagged RGB TIFF exports byte-identical to the untagged one.
  WebKit had never run the TIFF worker before.
- **By hand, against LittleCMS** (perceptual, to HP's sRGB), through `tiffPixels`:
  - the owner's painting: ΔE76 0.33 mean and 1.15 max (before: 11.9 mean, 26.1 max);
  - the same pixels with Windows' RSWOP profile (`mft2`): ΔE76 0.26 mean, 1.26 max;
  - an RGB file with a gamma 1.8 profile: 100 % within one level;
  - the same RGB file with HP's sRGB, LittleCMS's v4 sRGB, or an Epson scanner's table profile: byte-identical to
    the untagged file.
- **In the built site** (`wrangler dev`), with the owner's 39 MB TIFF. The exported front was compared with the
  front of the same painting converted by LittleCMS and added as an untagged RGB TIFF:
  - Chromium: ΔE76 0.32 mean, 1.01 max. WebKit: 0.35 mean, 2.51 max.
  - The old export was 11.85 mean, 30 max from it.
  - The console stayed clean. Adding both files took 4.5 s in Chromium and 3.0 s in WebKit.
- **Not checked:** the 40 MP stress run with CMYK TIFFs (it uses JPEGs), and Firefox (not in the suite).

## Open

- These still read without their profile, as before: ICC v4 table profiles (`mAB`), RGB profiles made of tables
  only (scanners), and grey profiles.
- A CMYK TIFF saved without a profile gets the plain formula: no default press profile is bundled.
