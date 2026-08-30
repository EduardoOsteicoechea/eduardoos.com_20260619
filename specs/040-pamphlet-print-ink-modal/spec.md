# Feature 040 — Pamphlet print ink modal (B&W + blue)

## Status

Shipped (2026-08-30). Patch: blue remaps header/footer meta gray too.

## Problem

Print always downloads a black-ink PDF. The user wants a choice at print time: keep today’s perfect black-and-white PDF, or the same layout with primary ink `#00368c` instead of black. After first ship, blue mode left header meta and footer contact grid gray (`0.4 0.4 0.4`) — those must also print blue.

## Goals

1. **Print modal:** Clicking Print opens a dialog (does not print yet) with:
   - **Blanco y negro** — identical to current PDF (black + gray meta). Default / primary action.
   - **Azul `#00368c`** — identical geometry and photos; every black (`0 0 0`) **and** gray meta (`0.4 0.4 0.4`) stroke/fill becomes `#00368c` (header title + meta grid, footer message + contact grid, column ink, frames).
   - **Cancel** — close without printing.
2. **Payload:** print JSON may include `ink_color`: `"black"` (default / omitted) or `"blue"`.
3. **Backend:** `BuildPamphletPDF` honors `ink_color`. Black path unchanged (black + gray meta). Blue remaps both `0 0 0` and `0.4 0.4 0.4` to `#00368c`; photos unchanged.
4. **Auth / errors:** unchanged (JWT, ServerErrorModal on failure).

## Non-goals

- Changing mm geometry or fonts.
- Recoloring embedded JPEG photos.
- Browser `window.print()` path as the primary flow.

## Acceptance

- [x] Print opens modal; Cancel does not call the API.
- [x] Blanco y negro → PDF with black ink and gray meta (current look).
- [x] Azul → former black **and** gray meta operators use `#00368c`; header meta rows and footer contact grid match outer blue chrome.
- [x] Omitted `ink_color` behaves as black.
- [x] `go test ./pkg/pdf/... ./internal/documents/...` green; FE build green.

## Affected paths

- `specs/040-pamphlet-print-ink-modal/spec.md`
- `backend/pkg/pdf/pamphlet.go`, `pamphlet_test.go`
- `backend/internal/documents/handlers.go`, `handlers_test.go` (log ink if useful)
- `frontend/src/lib/pamphlet-generator/src/shell.ts`, `main.ts`, `pamphlet_schema.ts` (optional field), `style.css` if modal needs a tweak
