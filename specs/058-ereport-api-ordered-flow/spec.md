# Feature 058 — eReport external API ordered flow (access → library → edit)

## Status

**Ready to implement** (2026-09-03).

## Problem

External clients jumped straight to report GET/POST. Operators need a **strict one-at-a-time sequence**: prove access, list owned reports, then perform the first edit.

## Goals

### Ordered eReport v1 steps (API key)

| Step | Action | Method + path | Success shape |
|------|--------|---------------|---------------|
| **1** | Check access | `GET /api/v1/ereport/access` | `{ allowed: true, service: "ereport", email, ownerSafe }` |
| **2** | List available reports | `GET /api/v1/ereport/library` | `{ ownerSafe, reports: [{ id, tema, reportNumber, updatedAt }] }` — **owned only** |
| **3** | First edit | `GET` then `POST /api/v1/ereport/reports/{ownerSafe}/{reportId}` | Existing 055 replace rules (`confirmOverwrite: true`) |

- Same auth/entitlement gate as other `/api/v1/ereport/*` (`api` + `ereport`, or admin key).
- Client tooling / docs / agent prompt **must** expose CLI commands that run these steps **separately** (`access`, `library`, `get`, `put`) — never one mega-command that skips 1–2.
- Docs catalog (`/api/v1/docs`) and `/api-docs` prompt updated to this order.

## Non-goals
- Shared/invite reports in the library API response
- Org-scoped library
- Combining steps into a single endpoint

## Acceptance
- [x] Access + library handlers + tests
- [x] Docs JSON + UI prompt list steps 1→2→3
- [x] FE build; commit + push

## Affected paths
- `specs/058-ereport-api-ordered-flow/spec.md`
- `backend/internal/ereport/apiv1.go` (+ tests)
- `backend/internal/apikeys/docs.go`
- `frontend/src/components/ApiDocs/ApiDocsPage.tsx`
- `specs/057-api-docs/spec.md` (cross-ref)
