# Feature 054 — Universal site layout (Articles chrome everywhere)

## Status

**Active** (2026-09-01). Locked from user: apply the **general site layout** to the whole website; only three **editing surfaces** may leave that chrome.

## Problem

Product and marketing routes do not share one page shell. Pamphlet still mounts a dedicated `PamphletLayout` for **dashboard and editor**, so the hamburger tray / rail / main gutters diverge from Articles (`/dashboard/articulos`). Scrib and eReport hubs already sit in `BaseLayout`, but their **editors** must remain full-bleed workspaces. The user requires **one layout for all routes and UI chrome**, with explicit exceptions only for those editors.

## Reference layout (locked)

The **general layout** is what Articles uses today:

1. **`BaseLayout`** — site Header (desktop left rail + mobile top bar + hamburger tray).
2. **`<main>`** offset by `--header_width` / `--header_height` (same tokens as today).
3. **Content inset** — `.product-dash` (or equivalent `.page-shell.page-shell--product`) gutters: full-width, left-aligned, `padding: var(--p3) var(--page-inline-pad, var(--p2)) var(--p5)`.
4. **Product hubs** — `ProductHubShell` + optional HDS icon menu (`?view=`), as in specs 045 / 051.

No second “app shell” for product dashboards. No centered narrow column for product hubs (subscription cards stay left-aligned per 053).

## Goals (locked)

### A. Every route uses `BaseLayout`

- **All** Astro pages render through `BaseLayout` (Header + `<main>`).
- **Forbidden:** mounting product dashboards inside `PamphletLayout` or any other parallel document shell.
- Home, Contact, auth, admin, Agent Sandbox, subscription, and every product hub/list/reader stay on `BaseLayout`.

### B. Same content chrome

- Default content inside `<main>` uses the Articles / product-dash gutters (goal A.3).
- Product list/hub/browse/read surfaces (Articles, Music, eVoice, Pamphlet **dashboard**, Scrib **dashboard**, eReport **hub**, Homescool hubs, Church hubs, BIM hub, Calvin’s hub, Admin users, Subscription, Contact, Auth forms) must not invent a different outer padding/max-width scheme that fights `.product-dash`.

### C. Hard exceptions — editing surfaces only

These three may go **full-bleed inside `<main>`** (no product-dash title padding; canvas/iframe may fill the content area). They still keep **Header / rail / tray** from `BaseLayout` (do not remove the site chrome).

| Surface | When | Routes / views |
|---------|------|----------------|
| **Pamphlet editor** | `?view=` is **not** `dashboard` (canvas / open / new / manage / footers / recent as generator mount) | `/documents/pamphlet` |
| **Scrib sheet editor** | Sheet editing UI | `/scrib/sheet` and pretty sheet paths that mount `ScribEditor` |
| **eReport report editor** | Issue-tracker iframe workspace; host shell must size the iframe to the full remaining viewport (explicit `dvh` / fixed inset — not `%` height alone through `astro-island`) | `/ereport/workspace` and pretty report paths that mount `EreportEditor` |

**Not exceptions:** Pamphlet **dashboard** (`view=dashboard` or default), Scrib **library/dashboard**, eReport **hub** (orgs/reports list), BIM viewer tool view, Calvin’s reader, Articles browse/reader — those stay on the general layout (tool UIs may drop the hub title but keep main gutters unless already flush for the canvas in 051; do not invent new shells).

### D. Pamphlet specifically

- Page file uses **`BaseLayout`**, not `PamphletLayout`.
- `view=dashboard` → `ProductHubShell` + cards (same as Articles).
- Non-dashboard → toggle a single document class (e.g. `html.layout-editor-bleed`) and mount the mm/px generator full-bleed under `<main>`; generator geometry stays mm/px pass-through (045).

## Non-goals

- Redesigning home marketing copy or removing the home/contact agent tray **composition** (they still use BaseLayout chrome).
- Changing Pamphlet/Scrib mm/px geometry.
- Moving more products under `/dashboard/` (051 already covers Articles / Institutes / BIM).
- Removing Admin / Agent Sandbox admin-only visibility (052).

## Acceptance

- [x] Spec written and checked in.
- [x] `/documents/pamphlet` (dashboard) uses BaseLayout + product-dash gutters like Articles.
- [x] Pamphlet non-dashboard views are the only pamphlet full-bleed exception; Header/rail remain.
- [x] Scrib sheet + eReport workspace editors are full-bleed exceptions; hubs stay general layout.
- [x] No product dashboard page uses `PamphletLayout` as its document shell.
- [x] FE build green; commit + push.

## Affected paths

- `specs/054-universal-site-layout/spec.md`
- `frontend/src/pages/documents/pamphlet.astro`
- `frontend/src/layouts/PamphletLayout.astro` (retire from route use; optional delete or leave unused)
- `frontend/src/components/Pamphlet/PamphletHub.tsx` (+ CSS)
- `frontend/src/layouts/BaseLayout.astro` / `frontend/src/styles/global.css` (editor-bleed class)
- `frontend/src/pages/scrib/sheet/**`, `frontend/src/pages/ereport/workspace/**`
- `frontend/src/components/Scrib/ScribEditor.*`, `frontend/src/components/Ereport/EreportEditor.*`
- `.memory/MILESTONE-054-*.md`
