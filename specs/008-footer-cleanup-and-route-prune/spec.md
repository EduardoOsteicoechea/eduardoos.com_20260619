# Feature 008 — Footer mm contract + meta row hide + route prune

## Status

Ready to implement (clarified 2026-08-19).

## Milestone (locked)

1. Footer **outer** page relationship is perfect — do not change page margin / footer band placement.

## Goals

### 2. Exhaustive footer mm contract (desktop → PDF)
Desktop and PDF still differ in **sizes**. Fix:

- Frontend `PAMPHLET_FOOTER_LAYOUT_MM` (and print payload `footer_layout`) must report **every** mm used to paint the footer: total height/width of the band, pad, outer/inner stroke + inset + radii, chrome gaps, **action_message separator** geometry, Acción box (font, lh, pad, min_h, computed section height rules), Mensaje box (same), meta col/row gaps, label vs value row heights, meta font/pad, cell stroke (editor only).
- Backend `drawFooter` must **only** use posted `footer_layout` values (after normalize defaults for legacy clients). **No parallel invented geometry** for footer chrome/type/section heights.
- If a size is needed and missing from the payload, add it to the FE constant first — never hardcode a new magic number only in Go.

### 3. Hide empty value meta rows
In the 2-column meta block, **hide** the value row between label row 1 (WhatsApp|Teléfono) and label row 3 (Dirección|Actividades) when both value cells are empty (same for value row 4 if empty). Labels stay. Desktop + PDF.

### 4. Double border between heading and `<p>`
Not a larger plain gap alone: between Acción (heading) and Mensaje (`<p>`), paint a **double horizontal rule** matching the footer’s double-frame language (outer + thinner inner), driven by `footer_layout` mm. Desktop CSS + PDF from the same tokens.

### 5. Route prune (KEEP / DELETE)

**KEEP (pages + needed API):**
- Home, Contact
- Services: Homescool (+ subpages), Church (+ subpages), Music (`/media/musica`), Pamphlet, Articles
- Auth (login/register/verify-otp/reset-password/profile)
- Admin users
- **Subscribe** (`/payments/subscription`) — ensure visible in UI (account menu / chrome as today or restore if missing from Services)

**DELETE (FE pages, unused libs, and backend handlers/routes — shrink repo; do not break KEEP):**
- BIM (`/bim` + `/api/bim`)
- APS Admin (`/aps-admin` + `/api/aps`)
- Debate App / edebat (`/debate-app`, `/edebat` + `/api/edebat`)
- Instrumentalist (`/instrumentalist` + `/api/instrumentalist`)
- Greek (`/greek/**` + `/api/greek`)
- Media Gallery (`/media/gallery`) — Music stays
- Any “Videos” UI if present

**Safety:**
- Update CI critical static routes (drop `aps-admin` from required list).
- Remove dead imports; keep payments/subscribe + auth + remaining services compiling.
- `npm run build` + `go test` for remaining packages before push.

## Non-goals

- Changing DynamoDB table deletion in AWS.
- Removing pamphlet PDF or payments/IPN stack.
- Changing page-level Letter margins.

## Acceptance

- [x] `footer_layout` documents all footer mm; PDF uses only those for footer paint.
- [x] Empty meta value rows hidden desktop + PDF.
- [x] Double rule between Acción and Mensaje matches footer double-chrome language.
- [x] DELETE list gone from pages/routes/handlers; Subscribe visible; KEEP flows build.
- [x] Spec 005: FE build green before push when FE changed.
