# Feature 040 — Pamphlet print ink modal (B&W + blue)

## Status

Shipped (2026-08-30).

## Problem

Print always downloads a black-ink PDF. The user wants a choice at print time: keep today’s perfect black-and-white PDF, or the same layout with primary ink `#00368c` instead of black.

## Goals

1. **Print modal:** Clicking Print opens a dialog (does not print yet) with:
   - **Blanco y negro** — identical to current PDF (black ink). Default / primary action.
   - **Azul `#00368c`** — identical geometry, images, and gray meta rules; every place that currently uses black stroke/fill uses `#00368c` instead.
   - **Cancel** — close without printing.
2. **Payload:** print JSON may include `ink_color`: `"black"` (default / omitted) or `"blue"`.
3. **Backend:** `BuildPamphletPDF` honors `ink_color`. Black path byte-identical in behavior to today. Blue replaces only black (`0 0 0`) ink; gray meta (`0.4 0.4 0.4`) stays gray; photos unchanged.
4. **Auth / errors:** unchanged (JWT, ServerErrorModal on failure).

## Non-goals

- Changing mm geometry, fonts, or gray meta hierarchy.
- Recoloring embedded JPEG photos.
- Browser `window.print()` path as the primary flow.

## Acceptance

- [x] Print opens modal; Cancel does not call the API.
- [x] Blanco y negro → PDF with black ink (current look).
- [x] Azul → PDF content operators use `#00368c` RGB for former black ink; no `[imagen]` / layout regressions.
- [x] Omitted `ink_color` behaves as black.
- [x] `go test ./pkg/pdf/... ./internal/documents/...` green; FE build green.

## Affected paths

- `specs/040-pamphlet-print-ink-modal/spec.md`
- `backend/pkg/pdf/pamphlet.go`, `pamphlet_test.go`
- `backend/internal/documents/handlers.go`, `handlers_test.go` (log ink if useful)
- `frontend/src/lib/pamphlet-generator/src/shell.ts`, `main.ts`, `pamphlet_schema.ts` (optional field), `style.css` if modal needs a tweak
