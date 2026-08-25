# Feature 030 — APS webhook receiver + admin live monitor

## Status

Active (2026-08-25).

## Problem

Need an Eduardo OS endpoint that **receives Autodesk APS webhook payloads**, plus an **admin-only** page that shows arrivals in real time (for product tests / client demos). Menu link must be visible only to platform admin.

## Goals

### Routes

| Surface | Path | Auth |
|---------|------|------|
| FE page | `/product-tests/mps/aps-webhook` | Platform admin only (same gate as Admin users / Agent Sandbox) |
| Header menu | label **APS webhook** | Shown only when `isPlatformAdmin()` |
| BE ingest | `POST /api/aps/webhooks` | **Public** (APS cannot send JWT). Optional shared secret. |
| BE list | `GET /api/admin/aps/webhook-events` | JWT + platform admin |
| BE live | `GET /api/admin/aps/webhook-events/stream` | JWT + platform admin, **SSE** |

### Live updates (answer to “¿el frontend se actualiza cuando el backend recibe?”)

**Yes.** Pattern:

1. APS (or curl) `POST`s JSON to `/api/aps/webhooks`.
2. Backend stores the event in an in-memory ring buffer and **broadcasts** to all open SSE subscribers.
3. Admin page opens `EventSource` (or fetch-stream with Bearer) on `/api/admin/aps/webhook-events/stream` and prepends each event to the UI without refresh.

Locked choice: **SSE** (not WebSocket). Matches Agent Sandbox / logger stream; nginx must disable buffering for the stream path.

### Ingest behavior

- Accept `POST` with body as raw JSON (object or array). Empty body → `400`.
- Record: `{ id, receivedAt, correlationId, contentType, headers (subset), body (parsed or raw string), remoteAddr }`.
- Optional secret: if env `APS_WEBHOOK_SECRET` is non-empty, require matching header `X-Aps-Webhook-Secret` (or query `secret=`); else reject `401`.
- Respond `200` `{ "ok": true, "id": "…" }` quickly (APS expects fast ACK).
- Extensive `log.Printf` with correlation id.
- **Do not** run Design Automation from this MVP — receive + display only (hook for later WorkItem trigger).

### Admin UI

- Denied state for non-admin (same pattern as Agent Sandbox).
- Show callback URL to copy: `{origin}/api/aps/webhooks`.
- Live event list: newest first; pretty-print JSON body.
- On load: fetch recent events via list endpoint, then open SSE for new ones.
- Plain CSS component file; Eduardo OS theme tokens.

### Persistence

- In-memory ring buffer, **max 100** events (process restart clears). Sufficient for product-tests.

## Non-goals

- Triggering Design Automation WorkItems from the webhook (later).
- DynamoDB/S3 persistence of webhook history.
- Non-admin access to the page or stream.
- Restoring historical `/aps-admin` WorkItem UI.

## Acceptance

- [x] Spec clear; routes + SSE documented.
- [x] `POST /api/aps/webhooks` public; optional secret; logs extensively.
- [x] Admin list + SSE stream; FE page live-updates.
- [x] Header link admin-only; `isAdminOnlyPagePath` includes the page.
- [x] Nginx SSE proxy for the stream path (no buffering).
- [x] Go tests for ingest + admin gate; FE build; commit + push.

## Affected paths

- `specs/030-aps-webhook-monitor/spec.md`
- `backend/internal/apswebhook/**`
- `backend/cmd/server/main.go`
- `nginx/default.conf`
- `frontend/src/pages/product-tests/mps/aps-webhook.astro`
- `frontend/src/components/ApsWebhook/**`
- `frontend/src/config/routes.ts`, `frontend/src/lib/routeAccess.ts`
- `frontend/src/components/Header/Header.tsx`
- `backend/aps_app/README.md` (pointer)
