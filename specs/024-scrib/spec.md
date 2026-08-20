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
| `/scrib/{userSafe}/{bookId}/{sheetId}` | Editor (pretty URL; static shell + client path parse, same idea as church workspace) |

`userSafe` = email with `@` → `_at_` (same as epams). Caller may only open **own** prefix unless platform admin.

### 4. Sheet geometry
- **Portrait US Letter:** width **215.9 mm**, height **279.4 mm**.
- Background: `/documento_generado_columnas.jpg` — `object-fit: fill` (or equivalent) so the image **exactly** covers the sheet box (no letterboxing).
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
2. **Zoom mode** — bordered view; wheel / pinch zoom; pointer drag pans; exit returns to draw
3. **Stroke +** — increase stroke width (mm); show current size
4. **Stroke −** — decrease stroke width
5. **Eraser** — toggle; erases only on active layer (remove/hit nearby path segments or paint eraser via compositing — prefer deleting path hits under brush; MVP: draw white/transparent eraser paths with `destination-out` on a temp canvas then bake, OR remove paths whose bbox intersects eraser stroke — **MVP: freehand eraser that removes path points within radius of active layer paths**)
6. **Layers modal** — per layer: opacity slider (0–1), radio to set **sole** active layer
7. **Undo** — revert last stroke/erase action on active layer (in-memory stack + persist after undo)

Default mode = **draw** on active layer. Stroke color: **`#141820`** (site ink) all layers for MVP.

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
- PDF export
- Per-layer stroke colors / text typing tools (draw-only)
- Offline-first IndexedDB

## Acceptance
- [x] Catalog `scrib` + subscription UI + gate
- [x] Dashboard books/sheets CRUD
- [x] Editor route with exact Letter portrait + background image fit
- [x] Six SVG layers; one active; opacity; draw/erase/undo; zoom/pan mode
- [x] Header tools as listed; autosave on pointer up
- [x] S3 under `scrib/`; tests for keys/handlers; FE build; commit + push

## Affected paths
- `specs/024-scrib/spec.md`
- `backend/internal/payments/catalog.go`, `backend/internal/scrib/**`, gateway wire
- `frontend/src/lib/payments.ts`, `routeAccess.ts`, Header, pages `/scrib/**`, components `Scrib/**`
- `nginx/default.conf`
