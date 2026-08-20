# Feature 022 — Pamphlet desktop dark mode (screen) + label2 pad top 1mm

## Status

Ready to implement (2026-08-20).

## Problem

1. Desktop pamphlet sheet hard-codes white paper / black ink, so site dark mode leaves a blinding white “hoja” while chrome follows `--site-*`.
2. Dirección/Actividades row needs padding-top **1mm** with **no** band/row height changes.

## Goals

1. **Screen only (desktop view):** sheet, columns, header/footer frames, and editable inputs use:
   - background → `var(--site-body-bg)`
   - text → `var(--site-body-fg)`
   - borders / rules → `var(--site-body-fg)` (or shared `--pamphlet-*` aliases of those tokens)
2. **Print / PDF unchanged:** browser `@media print` and server PDF stay white paper + black/gray ink (existing Go colors). No PDF geometry or color API change.
3. Footer last labels row: `meta_label2_pad_top` **1** (was 1.2). Row height stays **6.5**; footer height stays **29.8**.

## Non-goals

- Dark PDF output.
- Changing mobile layout structure (may share the same screen ink tokens so `data-theme` works).
- Growing any footer/header band heights.

## Revision 2026-08-20 — PamphletLayout sheet override

Desktop sheet was still white because `PamphletLayout.css` forced
`body.page-pamphlet .pamphlet-app main.pamphlet-sheet { background:#fff; color:#000 }`
(higher specificity than generator `style.css`). Header/footer looked themed; columns/body did not.

- [x] Layout sheet uses `--pamphlet-paper-bg` / `--pamphlet-ink` (fallback `--site-body-*`).
- [x] Desktop columns/body text explicitly inherit pamphlet ink.
