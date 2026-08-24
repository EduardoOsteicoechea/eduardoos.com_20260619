# Feature 024 — Scrib (layered US Letter drawing sheets)

## Status

**Ready to implement** (2026-08-20) — defaults locked below; implement unless user overrides.

## Problem

Need a subscribed app **Scrib**: books of ruled US Letter sheets with layered SVG drawing over a fixed column background, cloud-persisted under S3 `scrib/`.

## Goals

### 0. Subscription
- Catalog id: **`scrib`** — label “Scrib”, $1/mo (same as other services).
- Access: active entitlement **or** platform admin.
- FE: `ServiceGate` / `checkServiceAccess("scrib")`; Header Services link; subscription page lists Scrib.

### 1–3. Routes & dashboard
| Path | UI |
|------|-----|
| `/scrib` | Dashboard: books (containers) → sheet cards + “Nueva hoja” |
| `/scrib/sheet?user=&book=&sheet=` | Editor shell (static; always loads without nginx rewrite) |
| `/scrib/{userSafe}/{bookId}/{sheetId}` | Pretty editor URL — nginx rewrites to `/scrib/sheet/index.html`; client `replaceState` after open |

**Bugfix (2026-08-20):** Navigating straight to the pretty path without an nginx rewrite (or when `try_files` fell through to `/index.html`) showed the home page. Links open the static shell first; nginx rewrite uses `rewrite … last` (homescool pattern), not a fallback to home.


### 4. Sheet geometry
- **Portrait US Letter:** width **215.9 mm**, height **279.4 mm**.
- Background: `/documento_generado_columnas_v2.jpg` — `object-fit: fill` (or equivalent) so the image **exactly** covers the sheet box (no letterboxing).
- Sheet centered in the viewport; editor chrome outside the transform; **no page scroll** in draw mode (overflow hidden on editor root).

### 5–7. Layers (SVG, z-index ascending)
| z | id | Label |
|---|-----|--------|
| 1 | `chapter` | Número de capítulo |
| 2 | `verse` | Número de versículo |
| 3 | `word` | Número de palabra |
| 4 | `original` | Texto original |
| 5 | `translation1` | Traducción 1 |
| 6 | `translation2` | Traducción 2 |

Each layer = one SVG with `viewBox="0 0 215.9 279.4"` (mm units) sized exactly to the sheet. Drawing = freehand `<path>` strokes on the **active** layer only.

### 8–10. Interaction & header tools
Dynamic header host (`#header-dynamic-menu-host`):

1. **Dashboard** — navigate `/scrib`
2. **Zoom mode** — the default editor mode; bordered view; wheel / pinch zoom; pointer drag pans. Its control selects zoom without implicitly enabling drawing.
3. **Draw mode** — replaces the former Pen only toggle. Drawing is possible only while this control is selected, and accepts only `pointerType === "pen"` (stylus / Apple Pencil / S Pen). Finger, palm, and mouse never create strokes.
4. **Fullscreen** — enters native browser fullscreen for the Scrib document without resetting its zoom or pan transform. The existing header tools remain usable for Zoom, Draw, Eraser, Layers, Undo, and stroke size. While fullscreen is active, a red icon-only close button with an X and an adjacent icon-only sidebar visibility toggle are fixed at the upper-right. The sidebar is visible initially; hiding it expands the viewport. Exiting with the browser Escape control also restores the regular editor and visible sidebar.
5. **Stroke +** — increase stroke width (mm); show current size
6. **Stroke −** — decrease stroke width
7. **Eraser** — toggle; erases only on active layer and accepts only `pointerType === "pen"`; finger, palm, and mouse never erase. Prefer deleting path hits under brush; MVP: freehand eraser that removes path points within radius of active layer paths.
8. **Layers modal** — per layer: opacity slider (0–1), radio to set **sole** active layer. Clicking the backdrop outside its panel closes it and persists its current values.
9. **Undo** — revert last stroke/erase action on active layer (in-memory stack + persist after undo)
10. **Print** — icon in dynamic header; opens the browser print dialog for **only the current sheet** (ruled background + SVG layers). Print uses each layer’s **current opacity** (same visibility as the editor). Geometry: **portrait US Letter** (`@page size: letter`, 215.9×279.4 mm), no zoom/pan transform, no editor chrome / header / modals. Screen dark-mode invert is **disabled** for print so ink stays dark on the ruled page. Browser print only — not a server PDF.

Default mode = **zoom** on active layer. Stroke color: **`#141820`** (site ink) all layers for MVP.

### 10a. Theme and reliable autosave
- In the dark site theme, invert the fixed ruled background image and all drawing-layer SVGs.
- Every local sheet mutation updates the editor's authoritative in-memory snapshot synchronously.
- Autosaves remain triggered after pointer/touch up, undo, and closing the Layers modal, but requests are serialized. A request response must never replace a newer local snapshot or overwrite a later queued write.
- Rapid consecutive strokes and slow/out-of-order network responses must preserve every completed stroke locally and in the final stored `sheet.json`.

### 11. S3 layout (`eduardoos20260607`, prefix `scrib/`)
```
scrib/{userSafe}/library.json
scrib/{userSafe}/books/{bookId}/book.json
scrib/{userSafe}/books/{bookId}/sheets/{sheetId}/sheet.json
```

`library.json`: `{ books: [{ id, name, updatedAt }] }`  
`book.json`: `{ id, name, sheets: [{ id, name, updatedAt }], createdAt, updatedAt }`  
`sheet.json`: `{ id, bookId, name, activeLayerId, strokeWidthMm, layers: [{ id, opacity, paths: [{ d, strokeWidth }] }], updatedAt }`

### 12–13. Persist
- **Autosave** on pointer/touch **up** after draw or erase (PUT sheet.json).
- Undo also triggers save after applying.

## API (JWT, entitlement `scrib` or admin)

| Method | Path |
|--------|------|
| GET | `/api/scrib/library` |
| POST | `/api/scrib/books` `{ name }` |
| PUT | `/api/scrib/books/{bookId}` |
| DELETE | `/api/scrib/books/{bookId}` soft or hard — **hard delete book + sheets** for MVP |
| POST | `/api/scrib/books/{bookId}/sheets` `{ name }` |
| GET | `/api/scrib/books/{bookId}/sheets/{sheetId}` |
| PUT | `/api/scrib/books/{bookId}/sheets/{sheetId}` full sheet body |
| DELETE | `/api/scrib/books/{bookId}/sheets/{sheetId}` |

Gateway mounts `internal/scrib` like church/homescool.

## Non-goals (MVP)
- Multi-user collaboration / sharing sheets across users
- Server-side PDF export (browser print of the live sheet is in scope)
- Per-layer stroke colors / text typing tools (draw-only)
- Offline-first IndexedDB

## Acceptance
- [x] Catalog `scrib` + subscription UI + gate
- [x] Dashboard books/sheets CRUD
- [x] Editor route with exact Letter portrait + background image fit
- [x] Six SVG layers; one active; opacity; draw/erase/undo; zoom/pan mode
- [x] Header tools as listed; autosave on pointer up
- [x] S3 under `scrib/`; tests for keys/handlers; FE build; commit + push
- [x] Zoom is the default; Draw and Eraser require a stylus and no other tool creates or removes paths
- [x] Layers modal closes when its backdrop is clicked
- [x] Dynamic header offers fullscreen; its fixed upper-right exit control and Escape both restore the normal viewport
- [x] Dark mode inverts the ruled background image
- [x] Slow or rapid autosaves preserve all completed strokes and never apply stale server responses over newer local changes
- [x] Fullscreen exit is a red icon-only X control; dark mode inverts the background and SVG layers; Scrib uses the v2 column background
- [x] Fullscreen preserves zoom/pan, retains all Scrib tools, and can toggle the visible header sidebar
- [x] Dynamic header Print prints only the current sheet, portrait US Letter, with live layer opacities; chrome/zoom hidden; no dark invert on print

## Affected paths
- `specs/024-scrib/spec.md`
- `backend/internal/payments/catalog.go`, `backend/internal/scrib/**`, gateway wire
- `frontend/src/lib/payments.ts`, `routeAccess.ts`, Header, pages `/scrib/**`, components `Scrib/**`
- `nginx/default.conf`
