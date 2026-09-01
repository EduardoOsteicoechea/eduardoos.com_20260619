# Feature 030 — APS webhook receiver + admin live monitor

## Status

**Retired (2026-09-01).** Website MPS product-test surfaces removed. Autodesk APS Design Automation (`backend/aps_app/**`) is unchanged.

## Retirement

Removed from Eduardo OS website usage:

| Surface | Path | Disposition |
|---------|------|-------------|
| FE page | `/product-tests/mps/aps-webhook` | Deleted |
| Header | **MPS tests** → APS webhook | Removed |
| BE ingest | `GET/POST /api/aps/webhooks` | Unmounted + package deleted |
| BE list | `GET /api/admin/aps/webhook-events` | Unmounted + package deleted |
| BE live | `GET /api/admin/aps/webhook-events/stream` | Unmounted + package deleted |
| Nginx | SSE location for webhook stream | Removed |

### Non-goals of retirement

- Do **not** modify `backend/aps_app/**` or other Autodesk APS API / Design Automation code.
- Do **not** remove APS DA credentials (`APS_CLIENT_ID`, `APS_CLIENT_SECRET`, `APS_ACTIVITY_ID`, etc.) used by Design Automation.

## Historical problem (archived)

Needed an Eduardo OS endpoint that received Autodesk APS webhook payloads, plus an admin-only live monitor page for product tests / client demos.

## Acceptance (retirement)

- [x] Spec marks feature retired; no website UI or gateway routes for APS webhook monitor/ingest.
- [x] `backend/internal/apswebhook/**` removed; not wired in `cmd/server`.
- [x] FE page, component, header link, route constants, and admin path gate removed.
- [x] Nginx SSE location for webhook stream removed.
- [x] `backend/aps_app/**` untouched.
