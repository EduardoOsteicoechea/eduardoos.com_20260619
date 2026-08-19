# Feature 011 — Header rule/gutter nudge + desktop footer title size

## Status

Ready to implement (2026-08-19).

## Goals

1. **Header double bottom rule 2mm lower; cols 1–2 start 2mm higher**
   - Add `rule_clearance: 2` mm above the double rule (inside the header band).
   - `height`: 23 → **25** (fits clearance).
   - `body_gutter`: 5 → **1** (cols start 2mm higher on the page: former 23+5=28 → 25+1=26).
   - Desktop CSS + PDF `header_layout` / defaults stay in sync. Do not invent PDF-only geometry.

2. **Footer Acción title slightly smaller on desktop only**
   - CSS desktop: reduce `.pamphlet-footer-action h1` (e.g. ~2.8mm).
   - Do **not** change `PAMPHLET_FOOTER_LAYOUT_MM.action_size` (PDF stays as today).

## Acceptance

- [x] Header rule sits 2mm lower vs meta; cols 1–2 start 2mm higher; `header_layout` posted/consumed.
- [x] Desktop Acción type smaller; PDF action_size unchanged.
- [x] `go test ./pkg/pdf/...` + FE build green.
