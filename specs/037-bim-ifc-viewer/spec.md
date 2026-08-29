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
   | **Delete IFC from library** | Platform admin only (JWT + `IsAdmin`); browser **confirm** before DELETE |
   | Python console / Output / run API | Platform admin only |
3. **Storage:** S3 bucket `eduardoos20260607` (env `S3_BUCKET` / `IFCBIM_S3_BUCKET`), prefix **`ifcbim/library/`** only (for now). Keys: `ifcbim/library/{safeBasename}.ifc`. DynamoDB `eduardoos_ifcbim` is **out of scope** for this slice (list from S3).
   - **Unique names:** Upload requires a **library name** form field (not only the OS filename). Server sanitizes to `[A-Za-z0-9][A-Za-z0-9._-]{1,119}.ifc`. If that key already exists (`HeadObject`), respond **409 Conflict** — no overwrite. Admin must choose a different name.
   - **Browse labels:** List shows **name**, **size**, and a human **uploaded/modified date** (from S3 `LastModified`) so entries are visually distinct even when names are similar.
4. **APIs:**
   - `GET /api/bim/models` — public — list `.ifc` under `ifcbim/library/`
   - `GET /api/bim/models/file/*` — public — stream object (path must stay under `ifcbim/library/`)
   - `POST /api/bim/models/upload` — JWT + admin — multipart `file` + required `name` → put under `ifcbim/library/` only if key free
   - `DELETE /api/bim/models/file/*` — JWT + admin — delete object under `ifcbim/library/` only (same path rules as GET file). **404** if missing. Non-admin → **403**.
   - `POST /api/bim/python/run` — JWT + admin — unchanged host sandbox
5. **Viewer:** Astro + React + `@thatopen/components`. Load IFC bytes from local file (admin upload path also stores to S3) or from library download URL. `COORDINATE_TO_ORIGIN: false`; `ifcLoader.load(..., coordinate=false, ...)`.
   - **Default model:** On first paint after the scene is ready, fetch `GET /api/bim/models` and **auto-load the first** library entry (sorted by `name` ascending). If the library is empty, leave the empty scene. User can still Browse / Upload / Offload afterward.
6. **Header dynamic menu** (icon-only, **Google Material Symbols** via site font link):
   - **Upload** — admin only; modal with **required library name** input + file picker; upload to S3 + load; surface 409 if name taken
   - **Browse** — everyone; modal lists library models with **date + size**; Load fetches bytes and shows in scene. **Admin only:** each row also has **Delete**; clicking runs `window.confirm` with the model name; on OK, `DELETE` the S3 object and refresh the list. If the deleted file is the one currently loaded in the viewer, **offload** it.
   - **Lights** — everyone; toggles lights side panel (moved off viewport rail)
   - **Python** / **Output** — admin only
   - **Offload model** — everyone when a model is loaded
7. **UI chrome:** No top-right status overlay message. Full-bleed viewport. No That Open logo. Lights panel opens from header (not a floating rail button).
   - **Viewport background:** Follows site theme (`html[data-theme]` / `html.dark`):
     - Light: warm **bone** paper **`#e8e0d4`** (not harsh white / not cold limestone `#f2f3f6`)
     - Dark: cool grey-blue **`#141820`**
     Set on Three.js `scene.background` and matching CSS on stage/canvas host. Re-apply when the user toggles Theme in the header.
   - **Helper grid:** That Open `Grids` instance may still exist for CSM `distanceRenderer` exclusion, but **`grid.three.visible = false`** by default (no visible floor grid).
8. **Default light preset** (user-locked from live panel; **Reset lights** restores this — not SimpleScene-only original):
   - Ambient intensity **2.85**, color `#ffffff`
   - Directional intensity **4.05**, color `#ffffff`
   - Sun elevation **16°**, azimuth **42°**
   - Shadows **on** (start on `ShadowedScene` + VSM), map size **2048**, bias **-0.002** (reduces stripe/acne on horizontal slabs; Reset restores this)
   - Keep existing shadow quality rules: exclude **grid only** from `distanceRenderer`; `updateShadows` on load / sun change / camera `rest`; cast/receive on **IFC fragment meshes** (terrain, street, cars, etc.)
   - **No shadow ground plane** — do not add a studio/catcher mesh. Shadows land on the IFC geometry itself.
   - **First paint:** After IFC load (including auto-load), schedule shadow refresh immediately and again after short delays (~100ms, ~500ms) so slab shading settles without requiring the user to orbit first.
9. **Nav:** Link **BIM IFC viewer** in Services Apps for everyone (not admin-only block). Remove from admin-only page path gate.
10. **Python runtime:** Unchanged (`backend/bim/bim_runtime`, timeout/caps, `BIM_IFC_ARGS` metadata only).

## Non-goals

- DynamoDB model index (this slice)
- Per-user `ifcbim/{email}/` uploads (library only for now)
- OpenCascade / IFC bytes to Python
- Separate Python Docker service
- Non-admin upload
- Non-admin delete
- Silent overwrite of existing library keys
- Silent delete without confirmation in the UI

## Acceptance

- [x] On open, after the viewer is ready, auto-load the first `ifcbim/library` model (by name); empty library → empty scene.
- [x] Public user opens `/bim/ifc/viewer` without login; sees scene + Browse + Lights + Offload (when loaded).
- [x] Browse modal lists `ifcbim/library/*.ifc` with **name + size + formatted date**; Load puts model in the viewer.
- [x] Admin Upload requires a **library name** input; stores under `ifcbim/library/{name}.ifc`; **409** if name already exists (no overwrite).
- [x] Admin Upload loads into the scene; non-admin has no Upload control; upload API returns 403 for non-admin.
- [x] Python / Output / run API admin-only; non-admin cannot run.
- [x] No top-right status message overlay.
- [x] Lights control lives in header dynamic menu (Material Symbol); rail lights button gone.
- [x] Header tool icons use Google Material Symbols.
- [x] Default / Reset lights match preset: ambient 2.85, directional 4.05, sun 16°/42°, shadows on, map 2048, bias **-0.002**.
- [x] Services menu shows BIM IFC viewer; page is not admin-only gated.
- [x] Viewport background is bone `#e8e0d4` in light theme and cool grey-blue `#141820` in dark theme; helper grid is hidden; updates when site Theme toggles.
- [x] Horizontal floor/slab shadow acne reduced via default bias -0.002; **no** shadow-catcher plane (IFC meshes only); shadows refresh on open without orbit.
- [x] Admin can Delete a library model from Browse after `confirm`; DELETE API removes S3 object under `ifcbim/library/`; non-admin has no Delete control / API 403.

## Affected paths

- `specs/037-bim-ifc-viewer/spec.md`
- `backend/internal/bim/**`
- `backend/cmd/server/main.go` (log line only if needed)
- `frontend/src/pages/bim/ifc/viewer.astro`
- `frontend/src/components/BimIfcViewer/**`
- `frontend/src/config/routes.ts`, `frontend/src/lib/routeAccess.ts`
- `frontend/src/components/Header/Header.tsx`
- `frontend/src/layouts/BaseLayout.astro` (Material Symbols font)
