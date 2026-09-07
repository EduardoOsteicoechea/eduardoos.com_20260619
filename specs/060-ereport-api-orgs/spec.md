# Feature 060 — eReport API org hierarchy (orgs → reports → edit)

## Status

**Shipped** (2026-09-03). **Amended 2026-09-07 by spec 072:** org v1 flow stays; **drop** flat paths and `legacyReports`; persist under VPS `media/ereport/<userId>/…` (not S3, not email `ownerSafe` directories). `ownerSafe` in JSON responses is display-only if present.

## Problem

The web eReport hub is **org-first** (Orgs → reports under an org). External `GET /api/v1/ereport/library` still listed **legacy flat** reports, so clients could not discover org report IDs the way the UI works.

## Goals

### Ordered flow (one step at a time)

| Step | Action | Path |
|------|--------|------|
| 1 | Access | `GET /api/v1/ereport/access` |
| 2 | List **orgs** | `GET /api/v1/ereport/orgs` → `{ ownerUserId, orgs: [{ id, name, order, hidden, updatedAt }] }` (owned; skip `hidden`). Display email optional; **not** a path key. |
| 3 | List **org reports** | `GET /api/v1/ereport/orgs/{orgId}/reports` → `{ orgId, orgName, reports: [{ id, tema, reportNumber, updatedAt }] }` |
| 4 | Edit | `GET` then `POST /api/v1/ereport/orgs/{orgId}/reports/{reportId}` with `confirmOverwrite: true` + full `payload` |

- Ownership: key owner only (same as 055).
- POST snapshots previous org-report version under the report’s **filesystem** history dir; max 50.
- `GET /api/v1/ereport/library` is an alias that returns **orgs** only (no `legacyReports`).
- **No** flat `…/reports/{ownerSafe}/{reportId}` in the new runtime (072 5B).
- Docs + agent prompt updated.

## Non-goals
- Create/delete org via API
- Invite/shared org access via API

## Acceptance
- [x] Orgs + org reports + org get/post handlers + tests
- [x] Docs/prompt order: access → orgs → org-reports → get/put
- [x] FE build; commit + push

## Affected paths
- `specs/060-ereport-api-orgs/spec.md`
- `specs/072-ereport-vps-filesystem/spec.md`
- `backend/internal/ereport/apiv1.go`, `history*.go`, tests
- `backend/internal/apikeys/docs.go`
- `frontend/src/components/ApiDocs/ApiDocsPage.tsx`
- `specs/058-ereport-api-ordered-flow/spec.md` (superseded listing steps)
