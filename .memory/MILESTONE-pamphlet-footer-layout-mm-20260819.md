# Milestone: Footer layout mm frontend → PDF — 2026-08-19

## Problem
Desktop footer and PDF footer looked different (cell borders, pad, type band).
Footer band was 56mm — large empty margin under the last meta row.

## Fix
- Frontend defines `PAMPHLET_FOOTER_LAYOUT_MM` (exact CSS mm for `.pamphlet-page-footer`).
- Print POSTs `footer_layout` with the live document JSON.
- Backend `PamphletFooterLayout` + `normalizeFooterLayout` drive `drawFooter` (no invented sizes).
- PDF paints bordered Acción/Mensaje + 8 meta cells like desktop.
- Footer height tightened to **33mm**; meta bar no longer flex-grows.
- Double chrome: outer border + thinner inner frame (`inner_inset` 0.45mm, `inner_stroke` 0.1mm) via CSS `::after` and PDF second `strokeRoundedRectMm`.
