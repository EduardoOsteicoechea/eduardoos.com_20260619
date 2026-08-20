# Feature 019 — Meta dividers (revised): single rules + header row gap

## Goals

1. Header meta `meta_row_gap` **+1mm**: `0.8` → **`1.8`**; band `height` **`29` → `30`** so the extra gap fits.
2. Header meta cross: **single** gray hairline (not double).
3. Footer meta top + cross: **single** gray hairline (not double).
4. PDF matches; recalc page1 body / right-col CSS + Go defaults.

## Acceptance

- [x] Row gap 1.8mm; single gray V/H (footer + top); heights synced; tests/build green.
