# Feature 051 — Dashboard prefix + hub for Articles / Institutes / BIM

## Status

**Done** (2026-09-01).

## Problem

Articles, Calvin’s Institutes, and BIM IFC viewer still live at top-level paths and open straight into the tool. Other product surfaces use a **dashboard hub** (`?view=dashboard` + HDS) and should share a consistent **`/dashboard/…` URL prefix**.

## Goals (locked)

### URL prefix

| Surface | New canonical path | Legacy (redirect, preserve query/hash) |
|---------|-------------------|----------------------------------------|
| Articles list hub | `/dashboard/articulos` | `/articulos` |
| Article reader | `/dashboard/articulos/ver?id=` | `/articulos/ver?id=` |
| Calvin’s Institutes | `/dashboard/latin/calvins-institutes` | `/latin/calvins-institutes` |
| BIM IFC viewer | `/dashboard/bim/ifc/viewer` | `/bim/ifc/viewer` |

- Update `APP_ROUTES` + nav tray links to the new paths.
- Legacy Astro pages (or Astro `redirects`) must send users to the new path **and keep** `location.search` / `hash` (critical for article `?id=`).
- Public HTML/JSON article crawler APIs may keep `/api/articles*`; **canonical link hrefs** in server-rendered HTML must use `/dashboard/articulos…`.
- `robots.txt`: Allow the new `/dashboard/articulos` paths (keep legacy Allows harmless).

### Product hub (`?view=` + HDS)

Same pattern as Music / eVoice / Pamphlet (spec 045): default view **`dashboard`**; icon-only Material Symbols in `#header-dynamic-menu-host`.

| Product | Views | Dashboard cards | Tool view |
|---------|-------|-----------------|-----------|
| Articles | `dashboard` \| `browse` | Browse → `browse` | Existing series/chapter list (`ArticlesList`) |
| Institutes | `dashboard` \| `read` | Read → `read` | Existing `CalvinsInstitutesReader` |
| BIM | `dashboard` \| `viewer` | Open viewer → `viewer` | Existing `BimIfcViewer` |

- On **dashboard** view: `ProductHubShell` title + `ProductHeaderMenu` (dashboard + tool) + `DashboardGrid`.
- On **tool** view: existing tool UI; HDS includes a **Dashboard** icon first (returns to `dashboard` view), then the product’s existing tools (Capita / Upload / Browse / …). Do not leave the user without a way back to the hub.
- Article **reader** page (`/ver`) stays a dedicated page (back link → Articles browse hub); no requirement for `?view=` on `/ver`.

### Auth (unchanged)

- Articles + Institutes: public.
- BIM viewer: public open; admin-only upload/delete/python (spec 037).

## Non-goals

- Moving Music / eVoice / Pamphlet / Scrib / eReport under `/dashboard/`.
- Changing `/api/latin/*`, `/api/bim/*`, `/api/articles*` path prefixes.
- Redesigning article tree, Institutes Capita UI, or BIM lights/upload.

## Acceptance

- [x] Spec written
- [x] Three products live under `/dashboard/…` with tray links updated
- [x] Legacy URLs redirect and preserve query/hash
- [x] Each opens on `?view=dashboard` (or default) with cards + HDS; tool views work; Dashboard HDS returns to hub
- [x] BE article HTML canonicals use `/dashboard/articulos…`
- [x] FE build + Go tests; commit/push

## Affected paths

- `specs/051-dashboard-prefix-hubs/spec.md`
- `specs/032-calvins-institutes/spec.md`, `specs/037-bim-ifc-viewer/spec.md` (path notes)
- `frontend/src/config/routes.ts`, `frontend/src/lib/routeAccess.ts`, `frontend/src/lib/navServices.ts`
- `frontend/src/pages/dashboard/**`, legacy redirect pages
- `frontend/src/components/{Articles,CalvinsInstitutes,BimIfcViewer,ProductDashboard}/**`
- `frontend/public/robots.txt`, `frontend/astro.config.mjs` (optional redirects)
- `backend/internal/content/articles.go` (+ tests if any assert URLs)
- `.memory/MILESTONE-*.md`
