# Feature 031 — MPS meeting probes console (MPSAPS-21)

## Status

Active (2026-08-25). Handoff hardening: ACC_ env aliases, configurable timeouts, SYNC disposition, nginx probe timeout.

## Problem

During a live APS/ACC client meeting we need **independent, clickable probes** on Eduardo OS that verify auth, hub/Docs access, webhook ingest, and admin parameters — one at a time — with verbose JSON diagnostics. A failure in probe N must never crash the API or block probe N+1. Slow APS calls must return structured JSON (`ok:false` + `nextStep`), not opaque nginx 504 HTML as the only signal.

## Goals

### Surfaces

| Surface | Path | Auth |
|---------|------|------|
| FE console | `/product-tests/mps/meeting-probes` | Platform admin only |
| Link from | `/product-tests/mps/aps-webhook` | Same |
| Header | Admin tray: **MPS tests** → **APS webhook** + **MPS probes** | `isPlatformAdmin()` |
| BE | `POST /api/admin/aps/probes/{probeId}` | JWT + platform admin |
| BE catalog | `GET /api/admin/aps/probes` | JWT + platform admin |
| Ingest | `GET/POST /api/aps/webhooks` | Public (+ optional `X-Aps-Webhook-Secret`) |

### Sync semantics (not Design Automation)

- **Sync** = Revit Cloud Worksharing **Sync With Central** (C4R `adsk.c4r` / `model.sync`).
- `SYNC_COMPLETE` → disposition `meeting_relevant` (stored + displayed).
- `SYNC_START` → disposition `ignored_no_da` (stored + displayed; **never** triggers DA / any worker).
- No AppBundle / Activity / WorkItem in this feature.

### Probe wrapper contract

HTTP **200** from the wrapper unless Eduardo itself is misconfigured (empty probeId → 400).

Timeout per probe: `PROBE_TIMEOUT_MS` (default **25000**). APS HTTP client timeout: `APS_HTTP_TIMEOUT_MS` (default **20000**). On deadline: `ok:false`, `details.timeout=true`, `nextStep` mentions upstream/nginx timeout — never treat nginx HTML as success.

### Probes (order)

1. `health`
2. `env-check` — booleans for APS_/ACC_ credentials and optional hub/project/secret/scopes
3. `aps-token` — 2LO; never return token
4. `webhook-ingest-get`
5. `webhook-sync-complete` (alias `webhook-ingest-post-synthetic`)
6. `webhook-sync-start` (alias `webhook-ignore-sync-start`)
7. `hubs-list`
8. `projects-list`
9. `docs-smoke`
10. `admin-project-params` — 403 → Admin provisioning message (not “empty fields”)
11. `hooks-list-c4r`

### Env (backend only)

| Env | Alias / notes |
|-----|----------------|
| `APS_CLIENT_ID` | or `ACC_CLIENT_ID` |
| `APS_CLIENT_SECRET` | or `ACC_CLIENT_SECRET` |
| `APS_OAUTH_SCOPE` | or `ACC_SCOPES` (default includes `data:read` + `account:read`) |
| `APS_HUB_ID` | or `ACC_HUB_ID` |
| `ACC_HUB_NAME` | optional label only |
| `APS_PROJECT_ID` | or `ACC_PROJECT_ID` |
| `APS_REGION` | or `ACC_WEBHOOK_REGION` |
| `APS_WEBHOOK_SECRET` | Eduardo `X-Aps-Webhook-Secret` ≠ APS `x-adsk-signature` |
| `APS_WEBHOOK_CALLBACK_URL` | documented default `https://eduardoos.com/api/aps/webhooks` |
| `PROBE_TIMEOUT_MS` | default 25000 |
| `APS_HTTP_TIMEOUT_MS` | default 20000 |

### Nginx (ops)

`location ^~ /api/admin/aps/probes` must use `proxy_read_timeout` **≥ probe timeout** (ship **90s**). Generic `/api/` must not be shorter than probes or clients see 504 HTML before the wrapper finishes.

## Non-goals

- Design Automation AppBundle / Activity / WorkItem.
- dm.version.added / Publish trigger.
- DynamoDB persistence of webhook history (in-memory ring buffer remains).
- OAuth Redirect URL = webhook URL.

## Acceptance

- [x] Isolated probes; wrapper structured JSON; secrets never echoed.
- [x] SYNC_COMPLETE / SYNC_START dispositions; no DA trigger.
- [x] ACC_/APS_ aliases; configurable timeouts; timeout nextStep.
- [x] Nginx probes location ≥ 90s.
- [x] FE Sync With Central copy; meeting README.

## Affected paths

- `specs/031-mps-meeting-probes/**`
- `backend/internal/apswebhook/**`
- `backend/internal/apsprobes/**`
- `nginx/default.conf`
- `.env.example`
- `frontend/src/components/ApsProbes/**`
- `frontend/src/components/ApsWebhook/**`
