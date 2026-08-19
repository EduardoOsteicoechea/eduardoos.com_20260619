# Milestone: Header layout mm frontend → PDF — 2026-08-19

## Problem
PDF header title/meta sizes were correct (6.75mm / 2.5mm). Desktop looked wrong because
`.pamphlet-app .pamphlet-item[data-item-type="paragraph"] p { font-size: 3mm }` beat the
header title/meta selectors — title and meta values rendered at body size.

## Fix
- Frontend `PAMPHLET_HEADER_LAYOUT_MM` mirrors CSS (`--header-title-size`, meta, gaps, band).
- Desktop CSS uses those variables with selectors that beat the paragraph rule.
- Print POSTs `header_layout`; backend `PamphletHeaderLayout` + `drawHeader` consume it
  (same pattern as `footer_layout`).
