# Feature 013 — Header title double divider + lateral pad

## Problem

With the full header double frame in place, the title still lacks the Acción→Mensaje-style double horizontal rule. Meta sits too close to the title, and text hugs the left/right inner frame.

## Goals

1. **Title divider** — After the header title, paint the same double horizontal rule as `.pamphlet-footer-divider` / footer `divider_*` (`0.2` / `0.45` / `0.1` mm). Desktop + PDF via `header_layout`.
2. **Meta lower by 2mm** — `title_meta_gap`: `0.6` → **`2.6`** (clear space from divider bottom → meta bar). Desktop + PDF.
3. **Lateral pad +2mm** — Keep vertical `pad` at `1.2`; add **`pad_x: 3.2`** (`1.2 + 2`). Desktop CSS + PDF `drawHeader` use `pad` for Y and `pad_x` for X.
4. **Band height** — Grow header band to fit divider + larger gap: **`height: 30`**. Recalc page-1 body / right-col CSS + Go defaults from that height. Footer Acción PDF size untouched.

## Non-goals

- Changing footer divider tokens or Acción/Mensaje type sizes.
- Restoring a bottom rule under the whole header band (removed in 012 follow-up).

## Acceptance

- [x] Header DOM inserts a divider between title and meta (same visual language as footer divider).
- [x] `PAMPHLET_HEADER_LAYOUT_MM` includes `divider_*`, `pad_x`, `title_meta_gap: 2.6`, `height: 30`; CSS vars match.
- [x] PDF `drawHeader` strokes title→meta double rule and uses `pad_x` for horizontal inset.
- [x] `go test ./pkg/pdf/` green; `frontend` build green.
