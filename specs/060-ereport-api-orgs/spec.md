# Feature 060 — eReport API org hierarchy (orgs → reports → edit)

## Status

**Ready to implement** (2026-09-03).

## Problem

The web eReport hub is **org-first** (Orgs → reports under an org). External `GET /api/v1/ereport/library` still listed **legacy flat** reports, so clients could not discover org report IDs the way the UI works.

## Goals

### Ordered flow (one step at a time)

| Step | Action | Path |
|------|--------|------|
| 1 | Access | `GET /api/v1/ereport/access` |
| 2 | List **orgs** | `GET /api/v1/ereport/orgs` → `{ ownerSafe, orgs: [{ id, name, order, hidden, updatedAt }] }` (owned; skip `hidden`) |
| 3 | List **org reports** | `GET /api/v1/ereport/orgs/{orgId}/reports` → `{ orgId, orgName, reports: [{ id, tema, reportNumber, updatedAt }] }` |
| 4 | Edit | `GET` then `POST /api/v1/ereport/orgs/{orgId}/reports/{reportId}` with `confirmOverwrite: true` + full `payload` |

- Ownership: key owner only (same as 055).
- POST snapshots previous org-report version under org history prefix; max 50.
- `GET /api/v1/ereport/library` becomes an alias that returns **orgs** (same as step 2) plus optional `legacyReports` for old flat library rows (not the primary path).
- Flat `…/reports/{ownerSafe}/{reportId}` remains for legacy flat reports only; docs/prompt emphasize **org** paths.
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
- `backend/internal/ereport/apiv1.go`, `history*.go`, tests
- `backend/internal/apikeys/docs.go`
- `frontend/src/components/ApiDocs/ApiDocsPage.tsx`
- `specs/058-ereport-api-ordered-flow/spec.md` (superseded listing steps)
