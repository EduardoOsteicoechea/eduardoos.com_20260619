# Feature 037 — BIM IFC viewer + shared library + admin Python

## Status

Locked 2026-08-29 (public viewer + `ifcbim/library/` + UI chrome + light preset). Implement from this file.

## Problem

Visitors need a browser IFC viewer (That Open / web-ifc) with a shared model library on S3. Admins upload into that library and keep a host Python console for future OCC work — without a second Docker Python service.

## Goals

1. **Page:** `/bim/ifc/viewer` — **public** (no login required to open the page, browse, or load models). Not under `/admin/*`.
2. **Access matrix:**
   | Action | Who |
   |--------|-----|
   | Open viewer, orbit, lights, offload | Anyone |
   | Browse library + load IFC from S3 | Anyone (public APIs) |
   | Upload IFC to library | Platform admin (JWT + `IsAdmin`) |
   | Python console / Output / run API | Platform admin only |
3. **Storage:** S3 bucket `eduardoos20260607` (env `S3_BUCKET` / `IFCBIM_S3_BUCKET`), prefix **`ifcbim/library/`** only (for now). Keys: `ifcbim/library/{safeBasename}.ifc`. DynamoDB `eduardoos_ifcbim` is **out of scope** for this slice (list from S3).
4. **APIs:**
   - `GET /api/bim/models` — public — list `.ifc` under `ifcbim/library/`
   - `GET /api/bim/models/file/*` — public — stream object (path must stay under `ifcbim/library/`)
   - `POST /api/bim/models/upload` — JWT + admin — multipart `file` → put under `ifcbim/library/`
   - `POST /api/bim/python/run` — JWT + admin — unchanged host sandbox
5. **Viewer:** Astro + React + `@thatopen/components`. Load IFC bytes from local file (admin upload path also stores to S3) or from library download URL. `COORDINATE_TO_ORIGIN: false`; `ifcLoader.load(..., coordinate=false, ...)`.
6. **Header dynamic menu** (icon-only, **Google Material Symbols** via site font link):
   - **Upload** — admin only; modal; after pick, upload to S3 library **and** load into scene
   - **Browse** — everyone; modal lists library models; Load fetches bytes and shows in scene
   - **Lights** — everyone; toggles lights side panel (moved off viewport rail)
   - **Python** / **Output** — admin only
   - **Offload model** — everyone when a model is loaded
7. **UI chrome:** No top-right status overlay message. Full-bleed viewport. No That Open logo. Lights panel opens from header (not a floating rail button).
8. **Default light preset** (user-locked from live panel; **Reset lights** restores this — not SimpleScene-only original):
   - Ambient intensity **2.85**, color `#ffffff`
   - Directional intensity **4.05**, color `#ffffff`
   - Sun elevation **16°**, azimuth **42°**
   - Shadows **on** (start on `ShadowedScene` + VSM), map size **2048**, bias **0**
   - Keep existing shadow quality rules: exclude grid + shadow ground from `distanceRenderer`; `updateShadows` on load / sun change / camera `rest`; cast/receive on fragment meshes
9. **Nav:** Link **BIM IFC viewer** in Services Apps for everyone (not admin-only block). Remove from admin-only page path gate.
10. **Python runtime:** Unchanged (`backend/bim/bim_runtime`, timeout/caps, `BIM_IFC_ARGS` metadata only).

## Non-goals

- DynamoDB model index (this slice)
- Per-user `ifcbim/{email}/` uploads (library only for now)
- OpenCascade / IFC bytes to Python
- Separate Python Docker service
- Non-admin upload

## Acceptance

- [x] Public user opens `/bim/ifc/viewer` without login; sees scene + Browse + Lights + Offload (when loaded).
- [x] Browse modal lists `ifcbim/library/*.ifc`; Load puts model in the viewer.
- [x] Admin Upload stores under `ifcbim/library/` and loads into the scene; non-admin has no Upload control; upload API returns 403.
- [x] Python / Output / run API admin-only; non-admin cannot run.
- [x] No top-right status message overlay.
- [x] Lights control lives in header dynamic menu (Material Symbol); rail lights button gone.
- [x] Header tool icons use Google Material Symbols.
- [x] Default / Reset lights match preset: ambient 2.85, directional 4.05, sun 16°/42°, shadows on, map 2048, bias 0.
- [x] Services menu shows BIM IFC viewer; page is not admin-only gated.

## Affected paths

- `specs/037-bim-ifc-viewer/spec.md`
- `backend/internal/bim/**`
- `backend/cmd/server/main.go` (log line only if needed)
- `frontend/src/pages/bim/ifc/viewer.astro`
- `frontend/src/components/BimIfcViewer/**`
- `frontend/src/config/routes.ts`, `frontend/src/lib/routeAccess.ts`
- `frontend/src/components/Header/Header.tsx`
- `frontend/src/layouts/BaseLayout.astro` (Material Symbols font)
