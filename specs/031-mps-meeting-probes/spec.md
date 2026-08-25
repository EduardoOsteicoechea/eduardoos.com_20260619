# Feature 031 — MPS meeting probes console (MPSAPS-21)

## Status

Active (2026-08-25).

## Problem

During a live APS/ACC client meeting we need **independent, clickable probes** on Eduardo OS that verify auth, hub/Docs access, webhook ingest, and admin parameters — one at a time — with verbose JSON diagnostics. A failure in probe N must never crash the API or block probe N+1.

## Goals

### Surfaces

| Surface | Path | Auth |
|---------|------|------|
| FE console | `/product-tests/mps/meeting-probes` | Platform admin only |
| Link from | `/product-tests/mps/aps-webhook` | Same |
| Header | optional under admin links: **MPS probes** | `isPlatformAdmin()` |
| BE | `POST /api/admin/aps/probes/{probeId}` | JWT + platform admin |
| BE catalog | `GET /api/admin/aps/probes` | JWT + platform admin |

### Probe wrapper contract (always)

HTTP **200** from the wrapper unless Eduardo itself is misconfigured (missing critical wiring → **503**).

```json
{
  "ok": true,
  "probeId": "aps-token",
  "title": "APS 2LO token",
  "startedAt": "...",
  "finishedAt": "...",
  "summary": "one line",
  "details": { },
  "nextStep": "plain language fix hint",
  "httpStatus": 200
}
```

- Underlying APS/ACC failure → `ok: false`, put status/body (truncated, redacted) in `details`, set actionable `nextStep`.
- Timeout per probe: **25s**.
- No secrets/tokens/private keys in `details`, UI, or logs (booleans / lengths / scopes only).

### Probes (button order)

1. `health` — Eduardo `/health` reachable locally.
2. `env-check` — required env present as booleans only (`APS_CLIENT_ID`, `APS_CLIENT_SECRET`, optional `APS_WEBHOOK_SECRET`, optional `APS_HUB_ID` / `APS_PROJECT_ID`).
3. `aps-token` — 2LO `client_credentials` token; report requested scopes; never return the token string.
4. `webhook-ingest-get` — GET public ingest probe.
5. `webhook-ingest-post-synthetic` — POST synthetic `adsk.c4r` `model.sync` with `state=SYNC_COMPLETE` and `source=meeting-probe`; confirm event appears in the in-memory monitor store.
6. `webhook-ignore-sync-start` — POST `SYNC_START`; confirm stored; document that no DA trigger exists yet (stored-only, not a worker kick).
7. `hubs-list` — Data Management hubs for the app token.
8. `projects-list` — projects for configured hub (`hubId` query/body or `APS_HUB_ID`).
9. `docs-smoke` — top folders / Docs root for a project (`projectId` or `APS_PROJECT_ID`).
10. `admin-project-params` — Admin API project parameters; on 403 verbose: Admin not provisioned / `account:read` / Custom Integration.
11. `hooks-list-c4r` — list webhooks `system=adsk.c4r` `event=model.sync` (read-only); show callback URLs + hook ids.

### UI

- Title: **MPS meeting probes**
- Vertical list: Run probe, description, status chip (`idle`/`running`/`ok`/`fail`), timestamp, expandable verbose panel (`summary`, pretty JSON `details`, `nextStep`).
- Optional **Run all sequentially** — continues after failures; end summary.
- Never auto-run on load.
- Optional fields: `hubId`, `projectId`, `region` (defaults from env).
- Meeting README blurb on the page.
- Do not break `/api/aps/webhooks` receive + monitor.

### Config / env

| Env | Required | Notes |
|-----|----------|--------|
| `APS_CLIENT_ID` | for APS probes | |
| `APS_CLIENT_SECRET` | for APS probes | never echo |
| `APS_WEBHOOK_SECRET` | optional | Eduardo `X-Aps-Webhook-Secret` (≠ APS `x-adsk-signature`) |
| `APS_HUB_ID` | optional default | |
| `APS_PROJECT_ID` | optional default | |
| `APS_REGION` | optional | e.g. `US` |
| `APS_OAUTH_SCOPE` | optional | default scopes for 2LO |

Document on page: callback `https://eduardoos.com/api/aps/webhooks`.

## Non-goals

- Design Automation AppBundle / Activity / WorkItem.
- dm.version.added publish automation.
- Destructive webhook deletes (unless future gated flag — not this change).

## Acceptance

- [x] Spec unambiguous.
- [x] 11 probes isolated; wrapper always structured JSON; 5xx only for Eduardo misconfig.
- [x] FE console + link from webhook monitor; admin-only.
- [x] Synthetic SYNC_COMPLETE appears in monitor store; SYNC_START documented as stored-only.
- [x] Existing webhook ingest/SSE unchanged.
- [x] Go tests for wrapper + at least health/env/synthetic; FE build; commit + push.

## Affected paths

- `specs/031-mps-meeting-probes/spec.md`
- `backend/internal/apsprobes/**`
- `backend/internal/apswebhook/**` (inspect/helpers only)
- `backend/cmd/server/main.go`
- `frontend/src/pages/product-tests/mps/meeting-probes.astro`
- `frontend/src/components/ApsProbes/**`
- `frontend/src/components/ApsWebhook/ApsWebhookMonitor.tsx` (link)
- `frontend/src/config/routes.ts`, `routeAccess.ts`, `Header.tsx`
- `.env.example`
