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
- Host chrome: **Tema** text input (saved with meta); **Compartir** (add/remove registered emails); cloud save status.
- Body: portable Issue Tracker (parity with `portable-issue-tracker` SPEC) embedded via host-bridged static HTML under `/ereport/tracker.html`.
- Save in tracker: downloads (kit behavior) **and** posts state to host → `PUT` cloud.
- Autosave cloud on host “Guardar en nube” and when tracker `saveAll` completes (bridge).
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

## Affected paths
- `specs/025-ereport/spec.md`
- `backend/internal/ereport/**`, `payments/catalog.go`, `cmd/server/main.go`
- `frontend/.../ereport/**`, `lib/ereport.ts`, Header, payments, routes, nginx
- `frontend/public/ereport/tracker.html` (+ host bridge)
- `portable-issue-tracker/` remains the kit source of truth for tracker behavior
