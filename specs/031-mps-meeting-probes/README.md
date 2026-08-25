# MPS meeting probes — how to use in a client meeting

Console: https://eduardoos.com/product-tests/mps/meeting-probes  
Webhook monitor: https://eduardoos.com/product-tests/mps/aps-webhook  

Platform admin JWT required. In the global header tray: **MPS tests** → **APS webhook** / **MPS probes**. Probes never auto-run on load.

## Before the call

1. Deploy backend with `APS_CLIENT_ID` / `APS_CLIENT_SECRET` (and optional `APS_WEBHOOK_SECRET`, `APS_HUB_ID`, `APS_PROJECT_ID`).
2. Confirm Custom Integration on the ACC account; scopes include `data:read` (and `account:read` if testing Admin params).
3. Default webhook callback: `https://eduardoos.com/api/aps/webhooks`.

## During the call (top → bottom)

| # | Probe | What green means |
|---|--------|------------------|
| 1 | health | Eduardo API up |
| 2 | env-check | Required env present (booleans only) |
| 3 | aps-token | 2LO token obtained (token never shown) |
| 4 | webhook-ingest-get | Public ingest answers |
| 5 | webhook-ingest-post-synthetic | Synthetic `SYNC_COMPLETE` lands in monitor |
| 6 | webhook-ignore-sync-start | `SYNC_START` stored; no DA trigger yet |
| 7 | hubs-list | Hubs visible to the app |
| 8 | projects-list | Projects for hub (set `hubId` if needed) |
| 9 | docs-smoke | Docs/folders readable for project |
| 10 | admin-project-params | Admin params readable (403 = provisioning) |
| 11 | hooks-list-c4r | Existing `adsk.c4r` `model.sync` hooks listed |

Optional: **Run all sequentially** — continues after failures and summarizes.

## Secrets note

- Eduardo optional header: `X-Aps-Webhook-Secret` (`APS_WEBHOOK_SECRET`) — not the same as APS `x-adsk-signature`.
- Never paste Client Secret / SSA private keys into the browser.

## Out of scope (no buttons)

Design Automation AppBundle/Activity/WorkItem, Publish triggers, destructive deletes.
