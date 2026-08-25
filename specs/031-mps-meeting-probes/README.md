# MPS meeting probes — how to use in a client meeting

Console: https://eduardoos.com/product-tests/mps/meeting-probes  
Webhook monitor: https://eduardoos.com/product-tests/mps/aps-webhook  

Platform admin JWT required. In the global header tray: **MPS tests** → **APS webhook** / **MPS probes**. Probes never auto-run on load.

**Sync** = Revit Cloud Worksharing **Sync With Central** (C4R `adsk.c4r` / `model.sync`), **not** Design Automation.

## Before the call

1. Deploy backend with `APS_CLIENT_ID` / `APS_CLIENT_SECRET` (or `ACC_CLIENT_ID` / `ACC_CLIENT_SECRET`).
2. Optional defaults: `APS_HUB_ID` / `APS_PROJECT_ID` (or `ACC_*`), `APS_OAUTH_SCOPE` or `ACC_SCOPES`.
3. Confirm Custom Integration on the ACC account; scopes include `data:read` (and `account:read` if testing Admin params).
4. Default webhook callback: `https://eduardoos.com/api/aps/webhooks` (`APS_WEBHOOK_CALLBACK_URL`).
5. Timeouts: `PROBE_TIMEOUT_MS` (default 25000), `APS_HTTP_TIMEOUT_MS` (default 20000). Nginx `location ^~ /api/admin/aps/probes` uses `proxy_read_timeout 90s` so clients get JSON fail, not opaque 504 HTML.

## During the call (top → bottom)

| # | Probe | What green means |
|---|--------|------------------|
| 1 | health | Eduardo API up |
| 2 | env-check | Required env present (booleans only) |
| 3 | aps-token | 2LO token obtained (token never shown) |
| 4 | webhook-ingest-get | Public ingest answers |
| 5 | webhook-sync-complete | Synthetic `SYNC_COMPLETE` → disposition `meeting_relevant` |
| 6 | webhook-sync-start | `SYNC_START` → `ignored_no_da` (no DA) |
| 7 | hubs-list | Hubs visible to the app |
| 8 | projects-list | Projects for hub |
| 9 | docs-smoke | Docs/folders readable |
| 10 | admin-project-params | Admin params readable (403 = provisioning) |
| 11 | hooks-list-c4r | Existing `model.sync` hooks listed |

Optional: **Run all sequentially** — continues after failures and summarizes.

## Secrets note

- Eduardo optional header: `X-Aps-Webhook-Secret` (`APS_WEBHOOK_SECRET`) — not APS `x-adsk-signature`.
- Never paste Client Secret / SSA private keys into the browser.

## Out of scope (no buttons)

Design Automation AppBundle/Activity/WorkItem, Publish triggers, destructive deletes.

## Ops: nginx

After deploy, EC2 regenerates `nginx/default.prod.conf` from `nginx/default.conf`. Confirm the probes location exists with `proxy_read_timeout 90s`. If you raise `PROBE_TIMEOUT_MS` above ~80s, raise that nginx timeout too.
