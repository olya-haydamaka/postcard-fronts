# Handoff: Haydamaka Postcard Tool (fronts + backs → print TIFF)

## Overview
A browser-only tool for the artist Гайдамака Оля (haydamaka.com) to prepare 15 vertical postcards for a printing studio. For each painting the user places the picture on the postcard front (auto-fit, with manual adjustment if needed), checks bleed, trim and resolution, and exports print-ready TIFF files for the front and the back. No backend, no accounts, no storage; images never leave the computer.

## About the design files
`Postcard Front Tool.html` is a **working HTML prototype**. It shows the intended look and behaviour and already implements every feature below in one vanilla-JS file. Recreate it as a small, maintainable static app: Vite + vanilla TypeScript is recommended, and there is no existing codebase. Split it into modules (state, geometry, rendering, TIFF encode/decode, i18n, UI). You may reuse the prototype's logic, especially the TIFF encoder and the geometry, but don't ship the HTML as-is.

## Fidelity
**High-fidelity.** Colours, type, layout, copy (UK and EN) and interactions are final. Match them.

## Output spec (fixed)
- File: 109 × 152 mm, 300 dpi → **1287 × 1795 px**. Includes bleed.
- Format: TIFF, RGB 8-bit, PackBits (compression 32773), XResolution/YResolution = 300/1, ResolutionUnit = inch.
- Background: white.
- Bleed: default 2 mm per side, so the trim is 105 × 148 mm. Editable; it affects overlays and auto-fit guides only, never the output pixel size.
- File names: `NN Title - front.tiff` / `NN Title - back.tiff` (e.g. `01 Багрянці - front.tiff`). Remove `.` and `,` from the title. Names don't change with the UI language.

## Slots (one editable constant, in order)
Placeholder titles: the series’ real titles are kept out of this public copy (the prototypes use the same ones). «Багрянці», the design’s own example, is a published painting.

01 Багрянці · 02 У затінку саду · 03 Ожина · 04 Простір · 05 Сосна. Пісня гірського вітру · 06 Тепло · 07 Вечірній ліхтар · 08 Місто моє · 09 Їжакові стежки · 10 Березовий гай, травневий спокій · 11 Єдиний промінь · 12 Руда лисиця · 13 Подвір'я, що спить · 14 Ранній іній · 15 Щебет птахів

The title can be edited per slot in the app (panel → Title). An edit updates the slot list, the back preview and the file names right away. "Reset to original" restores the default, and an empty input falls back to the original. Edits are kept in memory only.

## Screen layout
A single screen. Header, then three columns: slot list 260 px · stage 1fr · panel 280 px. Below 980 px the panel moves under the list and stage (list max-height 80vh, stage height 80vh).

**Header** (padding 14 × 20, bg #f8f5f0, bottom border 1 px #ddd3c5), left to right:
- Title (Cormorant Garamond 500 24 px, #2B241D)
- Spec line "109 × 152 mm · 300 dpi · 1287 × 1795 px · RGB TIFF" (mono 12 px, #8A7862; flex:1)
- "Add pictures" button (multi-file input)
- "Export all (N)" primary button, disabled when N = 0
- Language select (Українська / English)

**Slot list** (bg #f8f5f0, right border): a row per slot, grid `auto 38px 1fr`, gap 10, padding 8 × 12, bottom border.
- Number (mono 11 px, taupe), front thumbnail 38 × 53 px, title (Cormorant 500 15 px, ellipsis), status (7 px dot + mono 10.5 px text).
- Current row: white background with an inset 3 px terracotta left bar.
- Hover: white background.
- File drag-over: background #f3e3dc.
- Dropping a file on a row loads it into that slot.

**Stage**: front card centred at the largest scale that fits (max 6 px/mm, min 1.2). When "Back side by side" is on, the back sits 28 px to the right at the same scale.
- Label above each card: mono 10.5 px uppercase, tracking .06em.
- Card shadow: `0 1px 2px rgba(60,40,20,.12), 0 10px 30px rgba(60,40,20,.12)`.
- Shortcut hint below the cards.
- Empty state (no pictures at all): a dashed drop zone filling the stage, with the heading "Drop pictures here" (Cormorant 26 px) and two muted lines.
- While files are dragged over the window, the drop zone shows as an overlay.

**Panel** sections (padding 14 × 16, bottom border). Each starts with an h3: mono 10.5 px uppercase, tracking .08em, taupe.
1. **Title**: text input (Cormorant italic 500 17 px) and a "Reset to original" button.
2. **Picture**: file name, pixel size, Replace (file input) and Remove buttons.
3. **Placement**: Auto-fit / Manual segmented control; Scale slider 20–300 % with value; X and Y offset inputs (mm, step 0.5); Centre and Reset to auto buttons.
4. **Resolution (i)**: effective dpi (Cormorant 30 px) with a status dot and text, plus "Placed W × H mm" and "· cropped by card edge" when it applies.
5. **Card · all slots**: Auto-fit mode (i) with a Fill card / Side margins segmented control; Side margin mm (i), disabled in Fill card mode; Bleed mm (i); a trim note line.
6. **Show**: checkboxes Bleed area (i), Trim line (i), Safe zone & margins (i), Back side by side (i).
7. **Export**: "Export this card" primary button; "Also export backs" checkbox, **on by default**; a file-name note.

**Info icon (i)**: a 14 px circle with a 1 px taupe border and mono 9 px "i". On hover or focus it shows a tooltip below and to the left: 230 px wide, background #2B241D, white mono 11/1.45 text. The tooltip copy is in the prototype's `I18N` dictionary (`*Tip` keys).

**Toast**: fixed at bottom centre, background #2B241D, white mono 11.5 px, hides after 4.5 s.

## Geometry & behaviour
All maths is in mm in card coordinates: (0,0) is the top-left of the 109 × 152 file.

**Auto-fit** has a global mode:
- **Fill card (default)**: cover. `k = max(109/iw, 152/ih)`, so `w = iw·k` and `h = ih·k`, with `x = (109−w)/2` and `y = 0`. The picture is anchored to the **top** so the overflow is cropped at the bottom, where the artist's signature is (bottom right). For wider pictures the sides are cropped instead.
- **Side margins**: contain. The picture fits inside a box inset by the side margin (default 10 mm) on every side, centred, with no crop.
- Changing the mode, margin or bleed re-fits every slot that is in auto mode.

**Manual**: rect = the auto rect scaled by `s` (0.2–3) about the card centre, plus the offset (dx, dy) in mm. The first manual interaction converts auto → manual with s = 1 and offset 0, so the picture doesn't jump. Controls:
- Drag on the front card. Pointer capture; the cursor is grab while idle and grabbing while dragging.
- Double-click the front card: centre the picture horizontally only (dx = 0). The vertical position and the scale stay as they are.
- Wheel: `s *= exp(−clamp(deltaY, ±60) · 0.0004)`, gentle.
- Slider, the `−`/`+`/`=` keys (×1.02 per press), arrows (0.5 mm), Shift+arrows (2 mm), and the X/Y inputs.
- PgUp/PgDn switch slot. Keyboard shortcuts are ignored while an input has focus.

**Snapping while dragging** (skipped while Alt is held), threshold 1.5 mm, X and Y independent so corners snap:
- Picture left and right edges snap to x ∈ {0, b, b+5, m, 109−m, 109−b−5, 109−b, 109}.
- Picture top and bottom edges snap to the same set on the y axis, with 152 as the full height.
- The picture centre snaps to the card centre.
- While snapped, the active guide line is drawn across the card in #B5533A, 1.5 px solid.

**Cropped preview**: behind the card, a ghost canvas extends 14 mm on every side and draws the full picture rect blurred (about 0.9 mm, minimum 2 px) at 42 % opacity, with a dashed 1 px rgba(91,78,62,.6) outline of the picture bounds. The card itself draws white and then the sharp picture, clipped to the card.

**Overlays** (preview only; never in export). Defaults: Bleed and Trim on, Safe and Back off.
- Bleed: rgba(181,83,58,.13) fill outside the trim rect.
- Trim: dashed [6,4] 1 px #b2463a rectangle inset by b.
- Safe: dotted [2,3] rgba(91,78,62,.55) rectangle inset by b+5, plus solid rgba(138,120,98,.5) vertical lines at x = m and x = 109−m.

**Resolution**: effective dpi = `iw / (placedWidthMm / 25.4)`.
- ≥ 300 → ok, green `oklch(0.55 0.09 140)`, "Good for print".
- 200–299 → warn, amber `oklch(0.68 0.13 70)`, "May look soft".
- < 200 → bad, #B5533A, "Will look blurry".
- Shown in the panel and in the slot status.

## Loading pictures
- Accept TIFF, JPG, PNG and WebP from the file picker, a drop anywhere on the window, or a drop on a slot row. Detect TIFF by MIME type or by `.tif`/`.tiff` extension, since the MIME type is often empty.
- TIFF: decode with UTIF.js (load pako too, for Deflate). Use the largest IFD and `UTIF.toRGBA8` → `ImageData` → `createImageBitmap`. Other formats: `createImageBitmap(file)`.
- Matching, per file:
  1. A leading number `01`–`15` gives the slot.
  2. Otherwise, an exact match on the normalized title (current or original).
  3. Otherwise, a partial match (more than 3 characters).
  4. Unmatched files fill empty slots in order; files beyond the free slots are skipped.
- Normalize: NFC, lowercase, strip the extension, turn `’ ʼ ' \` " « » . , - _ ( )` into spaces, collapse spaces.
- Afterwards, toast the counts: matched / placed in empty slots / skipped.
- A file that can't be decoded → toast "Can't read {name}".

## Export
- Front: an offscreen canvas at 1287 × 1795; white fill; `drawImage` of the picture rect × (300/25.4) with `imageSmoothingQuality = 'high'`; then the TIFF encoder (dependency-free, in the prototype: `packbits` + `tiff`).
- Back (when "Also export backs" is on), at 300 dpi:
  - White background; text 10 mm from the left and top edges.
  - Line 1: "ГАЙДАМАКА ОЛЯ", Cormorant Garamond 500, 3.25 mm, letter-spacing 0.08em, #5B4E3E, top at 10 mm.
  - Line 2: «Title», Cormorant italic 400, 3.25 mm, #8A7862, baseline 4.75 mm below line 1's baseline.
  - "haydamaka.com", Cormorant italic 400, 3 mm, #B5533A, bottom 10 mm from the bottom edge.
  - Wait for the fonts to load before rendering.
- Export this card: the button reads "Exporting…" while it runs.
- Export all (N): only filled slots. If any are below 300 dpi, first show a confirm dialog listing their numbers. Then run sequentially with 700 ms between cards, show "Exporting k/N…" on the button, and toast a summary at the end.

## State
In memory only.
- Per slot: `{ i, t, t0, img, name, iw, ih, mode: 'auto'|'manual', s, dx, dy }`.
- Global: `cur, fit: 'trim'|'margin' (default 'trim' = Fill card), margin: 10, bleed: 2, ov: {bleed:true, trim:true, safe:false, back:false}, withBack: true, snap`.
- Warn on `beforeunload` when any picture is loaded.
- Only the UI language is persisted: localStorage key `haydamaka-postcard-lang`, default **uk**.
- Optional nice-to-have: export and import the placement settings as JSON, without the images.

## i18n
- Ukrainian (default) and English. All strings are in the prototype's `I18N.uk` / `I18N.en`, including tooltips, toasts, the confirm text and status labels. Copy them verbatim.
- Adding a language = adding one dictionary.
- These stay the same in every language: painting titles, the back design and file names.

## Design tokens
- Colours:
  - Page bg #efeae2; panels #f8f5f0; lines #ddd3c5; white #fff.
  - Ink #2B241D; dark #5B4E3E; taupe #8A7862; accent / terracotta #B5533A; trim red #b2463a; drag-over #f3e3dc.
  - ok `oklch(0.55 0.09 140)`; warn `oklch(0.68 0.13 70)`.
- Type: Cormorant Garamond (500, italic 400/500) for titles and values; JetBrains Mono (400/500) for UI at 10.5–12 px. Load both from Google Fonts.
- Buttons:
  - Default: square, 1 px #5B4E3E border, white background, mono 500 12 px, padding 9 × 14. Hover: #5B4E3E background with white text.
  - Primary: #5B4E3E background with white text; hover #2B241D.
  - Disabled: opacity .4.
  - Segmented: two equal buttons; the active one is filled #5B4E3E.
- Inputs: 1 px #ddd3c5 border, white background; the border turns #5B4E3E on focus. Checkboxes and the slider use `accent-color: #5B4E3E`.
- No rounded corners (except the dots and the info circle). No gradients.

## Assets
- `assets/01 Багрянці.webp` (1920 × 2578): a sample painting. The prototype preloads it into slot 01 as a demo. Make that a dev-only demo or drop it.
- Fonts: Google Fonts (Cormorant Garamond, JetBrains Mono).
- Libraries: pako 2.1.0 and utif 3.1.0 (npm), used only for TIFF input.

## Acceptance
1. Dropping 15 files named `01 ….jpg` … `15 ….jpg` fills every slot correctly.
2. With Fill card, a 2:3 picture → 109 × 163.5 mm, top at y = 0, 11.5 mm cropped at the bottom. A 3:4 picture → 114 × 152 mm, 2.5 mm cropped on each side.
3. With Side margins at 10 mm, a 3:4 picture → 89 × 118.7 mm; a 2:3 picture → 88 × 132 mm.
4. The exported TIFF opens in Photoshop / Preview as 1287 × 1795 px at 300 dpi, RGB, white background, no overlays.
5. Changing the mode, margin or bleed re-fits only the slots in auto mode.
6. Dragging an edge within 1.5 mm of the trim line snaps to it; with Alt held it doesn't.
7. Cropped areas are visible blurred around the card.
8. The UI opens in Ukrainian on first load; switching to English persists across reloads.
9. 15 pictures of about 40 MP load and export without freezing the tab (decode one at a time; small thumbnails).

## Open questions for the studio
- Confirm that 109 × 152 mm includes a 2 mm bleed.
- RGB or CMYK? A browser can't apply an ICC profile reliably. If CMYK is required, convert in Photoshop with the studio's profile.

## Files
- `Postcard Front Tool.html`: the working prototype (reference for all behaviour, copy and tokens).
- `Postcard Backs Print.html`: the earlier standalone back exporter (option G, 15 TIFFs). Its rendering is the same as the back in the tool.
- `assets/01 Багрянці.webp`: the sample image.
