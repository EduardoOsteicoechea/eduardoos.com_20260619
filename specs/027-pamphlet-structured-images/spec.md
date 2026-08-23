# Feature 027 — Pamphlet chrome UX + structured images template

## Status

Active (2026-08-23). Extension: lead slots outside columns + cloud recycle delete.

## Problem

Header/footer editing lacks live character remaining feedback. On mobile/tablet, header/footer fields overflow and lower-field margins clutter the chrome. Admins need a second pamphlet template with fixed 10:9 lead images on odd body columns without losing existing content when switching.

Lead images currently sit **inside** columns, so body text starts too low and column height is wasted. Cloud open has no way to remove pamphlets without losing the `.epam` bytes forever.

## Goals

### Character remaining (header/footer only)

- Per-field max lengths (schema): title 80, subtitle 120, header meta 40 each, footer action 80, message 160, footer meta 40 each.
- Thin status strip under header chrome: `N restantes` for the **active** header/footer field while its edit tray is open.
- Hide strip when focus leaves header/footer (body edit, close tray).

### Mobile / tablet chrome (`data-view-mode="mobile"`)

- Header and footer **containers** grow vertically (`height: auto`, `max-height: none`, `overflow: visible`) so stacked title/meta/action inputs never clip.
- Override desktop fixed mm row heights and `overflow: hidden !important` on header/footer fields (subtitle, meta rows, footer meta cells).
- Hide separate margins/borders/padding on **lower** header meta and footer meta fields (desktop unchanged).
- Desktop print/PDF geometry unchanged.

### Template types

- `pamphlet_single_sheet` — simple (current).
- `pamphlet_structured_images` — same chrome + columns, with lead images on columns **1, 3, 5, 7**.
- HeaderDynamicMenu button toggles type; migrating preserves header/footer/column content; switching to structured ensures a lead image item at top of cols 1/3/5/7 if missing.

### Structured lead images (layout)

**Only** when `type === pamphlet_structured_images`:

1. **Gap under lead**: bottom margin / PDF gap = **0.75 ×** previous (`5mm` → **3.75mm**).
2. **Outside columns**: each lead is a **sibling grid cell**, not the first item inside the column DOM:
   - Col **1**: below header, above column 1 body.
   - Cols **3, 5, 7**: above those columns (page-2 top for 3/5; page-1 top for 7).
3. **Column height shrinks** by `leadHeight (10:9 of column width) + 3.75mm` so text flows only in the remaining band.
4. JSON still stores the lead as the **first `image` item** of that column (serialize/deserialize round-trip); FE renders it in the lead slot.
5. PDF parity: same outside-column placement and reduced column content height.
6. Click lead → existing image tray (unchanged).

### Cloud open — soft delete to recycle bin

In **Open → From the cloud** modal (`#open-cloud-modal`):

1. Top **icon-only** delete button (no text label) toggles **select mode**.
2. In select mode: each list row shows a **checkbox**; opening a pamphlet by click is disabled while selecting.
3. When ≥1 checked: show a bottom **Accept delete** action; modal **must not exceed viewport height** (list scrolls inside).
4. Accept → browser `confirm`/`alert` confirmation; on OK → `DELETE` selected epams.
5. Server **moves** S3 body to `media/epams/{safeUser}/recycle-bin/{epamId}.epam`, removes metadata from the active list (no hard delete of bytes). Series tree / list omit recycled items.
6. No restore UI in this change.

## Non-goals

- Desktop layout changes for simple template.
- New image editor (reuse tray).
- Recycle restore / empty-bin UI.
- Hard permanent delete of S3 objects.

## Acceptance

- [x] Char remaining strip for header/footer edit only.
- [x] Mobile header/footer grow; lower meta margins hidden on mobile.
- [x] Mobile/tablet: chrome field overflow fixed via height:auto + overflow:visible !important on header/footer and meta rows.
- [x] Type toggle in dynamic header; content preserved.
- [x] Lead 10:9 in **slots above** cols 1/3/5/7; gap 3.75mm; column height reduced; PDF matches.
- [x] Open-cloud: icon → checkboxes → confirm → recycle-bin move.
- [ ] FE build; backend tests; commit/push.

## Affected paths

- `specs/027-pamphlet-structured-images/spec.md`
- `frontend/src/lib/pamphlet-generator/**`
- `frontend/src/lib/epams.ts`, `frontend/src/config/routes.ts`
- `backend/pkg/pdf/pamphlet.go` (+ tests)
- `backend/internal/content/` (epam store Delete/recycle + handlers)
