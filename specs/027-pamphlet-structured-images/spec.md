# Feature 027 — Pamphlet chrome UX + structured images template

## Status

Draft for implementation (2026-08-23).

## Problem

Header/footer editing lacks live character remaining feedback. On mobile/tablet, header/footer fields overflow and lower-field margins clutter the chrome. Admins need a second pamphlet template with fixed 10:9 lead images on odd body columns without losing existing content when switching.

## Goals

### Character remaining (header/footer only)

- Per-field max lengths (schema): title 80, subtitle 120, header meta 40 each, footer action 80, message 160, footer meta 40 each.
- Thin status strip under header chrome: `N restantes` for the **active** header/footer field while its edit tray is open.
- Hide strip when focus leaves header/footer (body edit, close tray).

### Mobile / tablet chrome (`data-view-mode="mobile"`)

- Header and footer containers grow vertically (`height: auto`, no clip).
- Hide separate margins/borders/padding on **lower** header meta and footer meta fields (desktop unchanged).

### Template types

- `pamphlet_single_sheet` — simple (current).
- `pamphlet_structured_images` — same chrome + columns, with lead images on columns **1, 3, 5, 7**.
- HeaderDynamicMenu button toggles type; migrating preserves header/footer/column content; switching to structured ensures a lead image item at top of cols 1/3/5/7 if missing.

### Structured lead images

- Aspect **10:9** (width = column); double border like header; **5mm** gap below image before column body.
- Empty until click → existing image tray (upload/paste + pan/zoom).
- PDF parity for structured type.

## Non-goals

- Desktop layout changes beyond template lead images.
- New image editor (reuse tray).

## Acceptance

- [x] Char remaining strip for header/footer edit only.
- [x] Mobile header/footer grow; lower meta margins hidden on mobile.
- [x] Type toggle in dynamic header; content preserved.
- [x] Lead 10:9 on cols 1/3/5/7 + tray + PDF.
- [x] FE build; commit/push.

## Affected paths

- `specs/027-pamphlet-structured-images/spec.md`
- `frontend/src/lib/pamphlet-generator/**`
- `backend/pkg/pdf/pamphlet.go` (+ tests as needed)
