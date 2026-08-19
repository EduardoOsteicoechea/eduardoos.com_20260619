# Feature 017 — Header meta section +1mm vertical

## Goals

1. Meta bar (2×2 Serie/Capítulo/Autor/Fecha): **+1mm above** and **+1mm below**.
   - `title_meta_gap` `0.6` → **`1.6`**
   - Band `height` `27` → **`29`** (+2mm total)
2. Keep `body_gutter` at 5mm. Recalc page1 body / right-col heights.

## Acceptance

- [x] Layout mm + CSS + PDF defaults match; tests + FE build green.
