# Feature 034 — Pamphlet footer meta inline pairs (fixed band height)

## Problem

The footer meta block uses four stacked rows (labels / values / labels / values).
When WhatsApp/Teléfono/Dirección/Actividades values are filled, the separate
value rows are only **1.5mm** tall, so content clips against the meta cross and
the outer footer frame. Stacked label-above-value inside each cell wastes vertical
space.

## Goals

Re-layout the meta block into **two rows × two columns** without changing the
footer band height (`PAMPHLET_FOOTER_LAYOUT_MM.height` **29.8mm** — non-negotiable).

### Row 1 (WhatsApp | Teléfono)

Each column is a single horizontal line:

- **Bold label** on the left
- **Value** on the right (ellipsis / single-line clip)

Row height = `meta_label1_row_h` + `meta_value_row_h` when either value is
non-empty; otherwise `meta_label1_row_h` only (same reservation as today’s
hidden empty value row).

### Row 2 (Dirección | Actividades)

Each column is a two-line cell:

- **Sub-row 1:** bold label left + first part of the value right (same line)
- **Sub-row 2:** remainder of the value **flush left** at the column’s left edge
  (not indented under the value). Desktop: inline flow (no float). PDF: first
  wrapped line beside the label; following lines at full cell text width from `x0`.

Row height = `meta_label2_row_h` + `meta_value_row_h` when either value is
non-empty; otherwise `meta_label2_row_h` only.

## PDF parity (revision 2026-08-27)

- **Reserve meta height from the footer floor** before growing Acción/Mensaje so
  the meta pair rows (and outer bottom stroke) are never eaten by a long Acción.
- Meta mid-rule sits between pair1 and pair2 (never through pair1 text). If only
  one pair fits, omit the mid horizontal rule.
- Outer/inner rounded frame still uses fixed `height` 29.8mm.

## Non-goals

- Changing footer band `height` (29.8), outer/inner chrome, Acción/Mensaje
  type sizes, or page placement.
- Changing footer JSON field names (`label1`…`value4`) or static footer profiles.
- Mobile view-mode free layout (keep readable; no print-band constraints).

## Acceptance

- [x] Desktop: meta is two pair rows; row 1 label|value inline per column.
- [x] Desktop: row 2 sub-row 2 is flush left (full column), not indented under value.
- [x] Footer CSS/PDF band height remains **29.8mm**.
- [x] Empty value pairs still collapse the +1.5mm value slice (labels-only height).
- [x] PDF reserves meta band; Acción cannot hide the bottom frame / pair2.
- [x] PDF mid-rule between pairs only; pair2 wrap line 2 flush left.
- [x] Serialize/edit trays still bind `data-footer-field` for all eight meta fields.

## Affected paths

- `specs/034-pamphlet-footer-meta-inline/spec.md`
- `frontend/src/lib/pamphlet-generator/src/pamphlet_io.ts`
- `frontend/src/lib/pamphlet-generator/src/pamphlet_schema.ts` (comments / docs only unless new mm aliases)
- `frontend/src/lib/pamphlet-generator/src/style.css`
- `backend/pkg/pdf/pamphlet.go` (+ tests in `pamphlet_test.go`)
