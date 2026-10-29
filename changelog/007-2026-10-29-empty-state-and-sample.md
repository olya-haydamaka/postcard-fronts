# 007 — First screen: the empty card and a sample

**Date:** 2026-10-29
**Version:** 26.10.6
**Follows:** 006-2026-10-29-wrangler-undici-advisories.md

## What changed

- **The empty card.** With no cards, the stage shows a blank white card with its bleed tint and dashed trim line,
  up to 4.2 px per mm. On it: «Drop pictures here», the formats line, **Try with a sample**, and «Nothing leaves your
  computer.». While files are dragged over the window, the stage gets a terracotta dashed outline. Over cards, a drag
  shows the words alone.
- **Try with a sample** loads a picture the tool draws: an abstract landscape, 1920 × 2578 px, as card 01 «Sample»
  («Приклад», in the interface language). The card:
  - carries a *Sample* tag after its status;
  - is left out of Export all and its count;
  - exports with Export this card, and its export note says it stays out of Export all;
  - is kept in the browser like any card;
  - makes way for a real picture put on it (its row, or Replace): that picture becomes a card of its own, named
    after its file.
- **The list** says «Cards appear here after you add pictures» while it is empty.
- **The panel** hides Picture, Placement and Resolution while there are no cards, with «Add pictures to place and
  export them.» above Title.
- **The export note** names the current card's files (`05 Title - front.tiff`, and `- back.tiff` while backs are
  on), in place of the fixed «01 Багрянці» example.
- The design documents follow the new handoff: `docs/spec.md` gains its «First-run / empty state» section, and
  `docs/prototype/postcard-front-tool.html` its changes (still with the placeholder titles).

## Why

- The owner's new design handoff, «postcard-fronts-empty-state»: the first screen was a bare dashed drop zone and
  a panel full of disabled controls.
- **The sample is drawn, not the painting.** The handoff ships the painting «Багрянці» as the sample. The owner
  decided not to ship it at all: the repository is public under MIT and keeps the paintings out. A drawn picture of
  the same size behaves the same way: the same dpi range, the side crop under Fill card, the blurred surround.
- **Adapted to cards that come from files:**
  - The panel's hint shows only while there are no cards, so it speaks of pictures, not of «this slot».
  - In the prototype a real file takes the sample's slot and keeps its title. Here the sample makes way, so the
    real picture keeps the name of its own file.
  - The prototype's sample stays when other files go to other slots. Here too: pictures added another way join the
    list, and the sample stays until it is replaced or removed.

## Details

- **Stored:** each card's IndexedDB record gains `sample`. Records stored before this have none and read back as the
  user's own pictures. No new key, no database version change.
- **Copy:** new entries `sample`, `sampleTag`, `sampleSkip`, `noPicHint` and `listEmpty` in all seven languages,
  and `filesNote` is now a function. `listEmpty` is the handoff's copy but not in its prototype. `noPicHint` is
  reworded. Both are listed in `tests/i18n.test.ts`, and the rest match the new prototype.
- **The drawn sample** (`src/render/sample.ts`): sky, sun, five hills and 2,500 brush marks from a seeded generator,
  saved as a JPEG at quality 0.9. It is drawn in about 0.2 s and comes out at 431 dpi under Fill card.

## Verification

- Unit tests (79):
  - the sample flag through storage, and a record without it read as a real picture;
  - a real picture clearing the flag;
  - the export note's file-name stem;
  - every new string against the new prototype, the five other languages for completeness.
- End-to-end, 26 (Chromium + WebKit smoke):
  - the empty start: the empty card white with the bleed tinted, the sample button, the list's line, the hint, the
    three sections hidden;
  - the sample: card 01 tagged, Export all (0), its own export decoded (1287 × 1795, the drawn landscape), a drag
    over cards showing the words alone, then a real card;
  - Export all saving only the real card's files, the tag back after a reload, a real picture on it replacing it;
  - the export note naming the current card and dropping the back when backs are off;
  - the tooltip and folding tests now add a card first, since Resolution hides without one.
- Both sample rules were proven by breaking them: counting the sample in Export all's label, and exporting it with
  Export all. The test failed each time, then passed once restored.
- Looked at: the empty screen in Ukrainian and English, a drag, and the sample loaded. The empty card's words stay
  inside the trim line in all seven languages at 1440 × 900, 1280 × 720 and 900 × 800, where the panel moves
  below.
