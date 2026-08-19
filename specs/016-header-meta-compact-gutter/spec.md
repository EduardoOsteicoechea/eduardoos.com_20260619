# Feature 016 — Compact header meta + wider body gutter

## Goals

1. **Meta section tighter** (−2mm above, −2mm below the 2×2 meta bar):
   - `title_meta_gap` `2.6` → **`0.6`** (space divider → meta).
   - Band `height` `31` → **`27`** (−4mm total: −2 gap + −2 unused space under meta).
2. **Header → cols 1–2** +2mm: `body_gutter` `3` → **`5`**. Recalc page1 body / right-col heights.

## Acceptance

- [x] Layout mm + CSS + PDF defaults match; tests + FE build green.
