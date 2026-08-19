# Feature 014 — Header pad tweak + footer body gutter

## Goals

1. Header lateral pad **−1mm**: `pad_x` `3.2` → **`2.2`**. Desktop + PDF via `header_layout`.
2. Header title **+1mm** internal bottom pad before the title double-divider: new `title_pad_bottom: 1`. Desktop CSS + PDF `drawHeader`. Grow band **`height` `30` → `31`** so meta still fits.
3. Gap cols 7–8 → footer **+2mm**: `--footer-body-gutter` / `PamphletFooterBodyGutterMm` / `main.ts` `footerBodyGutterMm` `2` → **`4`**. Recalc left-col and page-1 body heights.

## Non-goals

- Changing footer Acción/Mensaje type sizes or divider strokes.
- Changing header title type size.

## Acceptance

- [x] `pad_x: 2.2`, `title_pad_bottom: 1`, `height: 31`; CSS vars match.
- [x] Footer body gutter 4mm FE+PDF; left col / page1 body math updated.
- [x] Tests + FE build green.
