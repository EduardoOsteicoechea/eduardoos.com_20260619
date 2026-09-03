# Feature 025 — eReport (Issue Tracker + S3 + share)

## Status

**Ready to implement** (2026-08-20) — defaults locked.

## Problem

Port the Issue Tracker into Eduardo OS as **eReport**: subscribed users store `.ereport` JSON under S3 `ereport/`, list/open by user, set a **tema**, load from disk or cloud, and share a report with other registered users so they can view it.

**Canonical tracker UI:** `frontend/public/ereport-tracker.html` (alias `frontend/public/ereport/tracker.html`). UX/styles synced to populado Issue Tracker (spec 049): Material Icons topbar, sticky section/group heads, collapse, inplace editors, `no_aplica`, tutorial + progress/save modals. Host `postMessage` bridge preserved.

## Goals

### 0. Subscription
- Catalog id: **`ereport`** — label “eReport”, $1/mo.
- Access: active entitlement **or** platform admin.
- Shared viewers do **not** need the entitlement to **open a report shared with them**; creating/importing/owning still requires `ereport` (or admin).

### 1. Routes
| Path | UI |
|------|-----|
| `/ereport` | Redirect / gate → hub for current user |
| `/ereport/hub?user=` | Hub static shell (works without nginx rewrite) |
| `/ereport/{userSafe}` | Pretty hub URL (nginx → hub shell) |
| `/ereport/workspace?user=&report=` | Editor static shell (create/open navigates here first) |
| `/ereport/{userSafe}/{reportId}` | Pretty editor URL (nginx rewrite + client `replaceState`) |

**Bugfix (2026-08-20):** Opening the pretty editor path before nginx rewrite is live served `/index.html` (home). Links and post-create navigation use `/ereport/workspace?…` first; nginx rewrite uses `rewrite … last` (not try_files→home).

**Bugfix (2026-08-20 #2):** iframe `/ereport/tracker.html` matched the one-segment hub rewrite → `/ereport/hub/index.html` then re-matched the two-segment editor rewrite in a loop → nginx **500**. Fix: exact `location = /ereport/tracker.html` + lookaheads that exclude `hub/` and `workspace/` prefixes (not only exact `hub` end).

**Bugfix (2026-08-20 #3):** Tracker iframe moved to **`/ereport-tracker.html`** (outside `/ereport/…` pretty-URL rewrites) so a stale nginx config cannot 500 the iframe even before nginx redeploy.

### 2. S3 (`eduardoos20260607`, prefix `ereport/`)
```
ereport/{ownerSafe}/library.json
ereport/{ownerSafe}/reports/{reportId}/meta.json
ereport/{ownerSafe}/reports/{reportId}/report.ereport
ereport/{viewerSafe}/shared-index.json   // soft index of reports shared with me
```

`meta.json`: `{ id, tema, reportNumber, reportDate, ownerEmail, ownerSafe, sharedWith: [{ email, userSafe }], updatedAt, createdAt }`  
`report.ereport`: Issue Tracker JSON (`reportDate`, `reportNumber`, `appTitle`, `sections…`) as produced/consumed by `ereport-tracker.html`.  
`library.json`: `{ reports: [{ id, tema, reportNumber, updatedAt }] }`  
`shared-index.json`: `{ items: [{ ownerSafe, reportId, tema, updatedAt }] }`

### 3. Hub behavior
- Cards for owned reports (tema, number, updated).
- Section “Compartidos conmigo”.
- **Nuevo** — prompt tema → create empty skeleton report → open editor.
- **Cargar .ereport** — file picker → import into cloud with tema (default from filename or “Sin tema”).
- Click card → editor.

### 4. Editor
- **No host chrome above the iframe.** All editor tools live in the site **Header dynamic slot** (`#header-dynamic-menu-host`), same pattern as Scrib/Homescool/Pamphlet.
- **No Issue Tracker topbar** inside the iframe. The former `.topbar` (“Issue Tracker” title + icon row) is **removed**. Meta fields (Organization, Report name, Fecha, Número) stay in the edit body.
- **HDS icon groups** (icon-only; Material Symbols or SVG; `title`/`aria-label` required):
  1. **Tracker tools** (host → iframe `postMessage` `{ target: "ereport-tracker", type: "command", command }`):
     - Tutorial (`tutorial`) — opens howto modal in iframe
     - Toggle sidebar (`toggle-sidebar`)
     - Font up / down (`font-up` / `font-down`)
     - Upload `.ereport` (`upload`) — triggers hidden file input in iframe
     - Clear all (`clear-all`) — confirm + reset in iframe
     - Progress (`progress`) — opens progress modal in iframe
     - Download export (`save-export`) — opens save modal → download `.ereport`+HTML+PDF (+ cloud-save bridge). **Regular HDS chrome** (not green); Material icon **`download`**.
  2. **Host tools** (modals on the page):
     - **Hub** — CTA to leave to the owner hub
     - **Tema** — tema text field (blur/save writes meta)
     - **Guardar en nube** — confirm + status; runs collect → `PUT` cloud. **Only this HDS control is green** (class `ereport-hds-cloud-save`).
     - **Compartir** — add/remove registered emails (owners only; hidden if `!canShare`)
     - **Historial** — API overwrite snapshots (owners only when enabled)
- Body: Issue Tracker embedded via host-bridged static HTML at **`/ereport-tracker.html`** (alias `/ereport/tracker.html`).
- **Viewport fill (locked):** Under `html.layout-editor-bleed` (spec 054), the host `.ereport-editor` + tracker iframe must occupy the full remaining window under the site Header/rail — not a short band at the top with empty page chrome below. Do **not** rely on `height: 100%` alone through Astro’s `astro-island` wrapper; use an explicit viewport height (`calc(100dvh - var(--header_offset, …))` and/or fixed inset like Scrib) so the iframe always stretches.
- **Bug fix (2026-09-02):** Bleed CSS set `min-height: 0` / `height: 100%` on the editor and frame; the percentage chain broke at the island, so the iframe collapsed to a short strip. Restore explicit viewport sizing.
- **Theme:** Tracker has **no** local light/dark button. Appearance follows the site Header theme toggler (`eduardoos-theme` / `html[data-theme]`). Host pushes `postMessage` `{ type: "theme", dark }` on boot, after payload load, and whenever the document theme attrs change.
- **Nav sidebar dots:** color by item status — **green** `aprobado`, **red** `reprobado`, **gray** undefined/empty. Active item keeps a gold focus ring without replacing the status fill.
- **Inline title edit (tracker):** sección máxima and subsección/grupo titles are **always `<input>` fields** styled as headings (click/focus to edit). Enter or blur commits into state; values persist in `.ereport` via `collectFromDom`.
- Save export from HDS: downloads (download icon, regular chrome) and may bridge to cloud; **green accent is only on Guardar en nube**.
- Cloud save also from header modal and when tracker `saveAll` completes (bridge).
- Owner: full edit + share. Shared user: **view + edit body** (not delete report / not manage shares). Non-owner non-shared: 403.

### 5. API (JWT)
| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/ereport/library` | owned + shared |
| POST | `/api/ereport/reports` | `{ tema }` create empty |
| POST | `/api/ereport/reports/import` | `{ tema, payload }` from `.ereport` |
| GET | `/api/ereport/reports/{ownerSafe}/{reportId}` | authz owner/shared/admin |
| PUT | `/api/ereport/reports/{ownerSafe}/{reportId}` | `{ tema?, payload? }` |
| DELETE | `/api/ereport/reports/{ownerSafe}/{reportId}` | owner/admin |
| PUT | `/api/ereport/reports/{ownerSafe}/{reportId}/shares` | owner; `{ emails: string[] }` — must be registered users |

IAM already allows Get/Put/Delete on `arn:aws:s3:::eduardoos20260607/ereport/*` **and** ListBucket prefixes `ereport/` / `ereport/*` via `deploy/aws/ec2-iam-s3-policy.json` (also `scrib/`). If create returns HTTP 502 `could not save meta`, the EC2 role is missing that statement — update the inline/managed S3 policy on `eduardoos-ec2-s3-role` and wait ~1 minute for credentials to refresh.

## Non-goals
- Real-time multi-cursor collaboration.
- Moving images out of base64 into separate S3 objects (MVP keeps embedded base64 in `.ereport`).
- Public unauthenticated links.

## Acceptance
- [x] Catalog + Subscribe + Services menu “eReport”
- [x] Hub list / create / import / open
- [x] Editor tema + tracker + cloud save under `ereport/`
- [x] Share with registered users; they see report in “Compartidos”
- [x] nginx pretty URLs; tests; FE build; commit + push
- [x] Section + group headings inline-editable in tracker
- [x] Hub / Tema / Guardar / Compartir in Header dynamic slot via modals (no chrome above iframe)
- [x] Workspace editor iframe fills the window under Header/rail (no collapsed top strip)
- [x] Tracker topbar removed; former topbar icons live in HDS and drive iframe via `command` postMessage
- [x] Meta panel (org / report name / date / number) remains in the edit body

## Affected paths
- `specs/025-ereport/spec.md`
- `backend/internal/ereport/**`, `payments/catalog.go`, `cmd/server/main.go`
- `frontend/.../ereport/**`, `lib/ereport.ts`, Header, payments, routes, nginx
- `frontend/public/ereport-tracker.html`, `frontend/public/ereport/tracker.html` (+ host bridge)
- `frontend/src/components/Ereport/EreportHeaderMenu.tsx` (+ modals)
