# Feature 039 — Structured pamphlet empty lead: no black matte, no `[imagen]`

## Status

Active (2026-08-30).

## Problem

Printed structured pamphlets (`pamphlet_structured_images`) look correct except empty lead image slots:

1. A black band / matte appears under or around the empty image frame (placeholder stroke stacking with the lead double border).
2. The label `[imagen]` is drawn inside empty slots.

Everything else (geometry, borders when intended, filled images, body text) must stay unchanged.

## Goals

1. **Empty image slots:** no black fill and no dark matte behind/under the frame. Transparent / paper only; keep the existing thin lead double border (outer + inner) when that path already runs.
2. **Remove `[imagen]`:** never write that placeholder string into the PDF (empty or failed decode).
3. **Screen parity:** empty lead frames use a transparent (paper) background; do not show a broken/empty `<img>` chrome or any `[imagen]` label.

## Non-goals

- Changing lead size, gap, column shrink, or double-border geometry.
- Changing how real JPEG images are embedded or fitted.
- PDF color / ink changes elsewhere.

## Acceptance

- [x] Empty structured lead in PDF: double border only; no `[imagen]` substring in PDF bytes; no filled black rect for the slot.
- [x] Empty body image (non-lead): thin hairline stroke only, or nothing if already framed — never `[imagen]`, never black fill.
- [x] Filled images still embed and paint as today.
- [x] `go test ./pkg/pdf/...` green; FE build green.

## Affected paths

- `specs/039-pamphlet-empty-image-chrome/spec.md`
- `backend/pkg/pdf/pamphlet.go`, `pamphlet_test.go`
- `frontend/src/lib/pamphlet-generator/src/style.css` (and `pamphlet_io.ts` only if needed to omit empty img src chrome)
