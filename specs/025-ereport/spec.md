# Feature 025 — eReport (Issue Tracker + S3 + share)

## Status

**Ready to implement** (2026-08-20) — defaults locked.

## Problem

Port `portable-issue-tracker` into Eduardo OS as **eReport**: subscribed users store `.ereport` JSON under S3 `ereport/`, list/open by user, set a **tema**, load from disk or cloud, and share a report with other registered users so they can view it.

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
`report.ereport`: portable Issue Tracker JSON (`reportDate`, `reportNumber`, `appTitle`, `sections…`) per kit SPEC.  
`library.json`: `{ reports: [{ id, tema, reportNumber, updatedAt }] }`  
`shared-index.json`: `{ items: [{ ownerSafe, reportId, tema, updatedAt }] }`

### 3. Hub behavior
- Cards for owned reports (tema, number, updated).
- Section “Compartidos conmigo”.
- **Nuevo** — prompt tema → create empty skeleton report → open editor.
- **Cargar .ereport** — file picker → import into cloud with tema (default from filename or “Sin tema”).
- Click card → editor.

### 4. Editor
- **No host chrome above the iframe.** Hub / Tema / Guardar en nube / Compartir live in the site **Header dynamic slot** (`#header-dynamic-menu-host`), same pattern as Scrib/Homescool/Pamphlet.
- Each of those four actions **opens a modal** over the page so the Issue Tracker’s own topbar stays flush under the site header:
  - **Hub** — modal with CTA to leave to the owner hub.
  - **Tema** — modal with tema text field (blur/save writes meta).
  - **Guardar en nube** — modal with confirm + status; runs collect → `PUT` cloud.
  - **Compartir** — modal to add/remove registered emails (owners only; hidden if `!canShare`).
- Body: portable Issue Tracker embedded via host-bridged static HTML at **`/ereport-tracker.html`** (alias `/ereport/tracker.html`).
- **Inline title edit (tracker):** clicking the **sección máxima** heading (`h2`, e.g. “1. Product / platform”) or a **subsección/grupo** heading (`h3`, e.g. “General”) replaces that text **in place** with an input styled as the heading; Enter or blur commits; Escape cancels. Titles persist in `.ereport` payload via `collectFromDom`.
- Save in tracker: downloads (kit behavior) **and** posts state to host → `PUT` cloud.
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
- Moving images out of base64 into separate S3 objects (MVP keeps kit format).
- Public unauthenticated links.

## Acceptance
- [x] Catalog + Subscribe + Services menu “eReport”
- [x] Hub list / create / import / open
- [x] Editor tema + tracker + cloud save under `ereport/`
- [x] Share with registered users; they see report in “Compartidos”
- [x] nginx pretty URLs; tests; FE build; commit + push
- [x] Section + group headings inline-editable in tracker
- [x] Hub / Tema / Guardar / Compartir in Header dynamic slot via modals (no chrome above iframe)

## Affected paths
- `specs/025-ereport/spec.md`
- `backend/internal/ereport/**`, `payments/catalog.go`, `cmd/server/main.go`
- `frontend/.../ereport/**`, `lib/ereport.ts`, Header, payments, routes, nginx
- `frontend/public/ereport-tracker.html`, `frontend/public/ereport/tracker.html` (+ host bridge)
- `frontend/src/components/Ereport/EreportHeaderMenu.tsx` (+ modals)
- `portable-issue-tracker/` remains the kit source of truth for tracker behavior
