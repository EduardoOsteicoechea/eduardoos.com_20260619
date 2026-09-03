# Feature 059 — API keys tray link + harden list against gateway 502

## Status

**Ready to implement** (2026-09-03).

## Problem

1. Profile API keys UI loads but `GET /api/apikeys` surfaces nginx **502 HTML** (upstream hang/crash), so the keys section looks broken.
2. There is no main-tray entry to open the API keys UI; users only find it buried on Profile.

## Goals

1. **Main menu:** tray link **API keys** → `/api-keys` (Material icon `key`), gated by `serviceId: "api"` (admin / active api entitlement), same visibility rules as other billable tray rows.
2. **Page:** `/api-keys` — `requireAuth`, mounts `ProfileApiKeys` (same UI as profile section). Keep the section on Profile too; add `id="api-keys"` for deep links.
3. **Harden backend list/create:** Dynamo (and all store) calls use a short context timeout; on failure return **JSON** 503/502 with a clear message (never hang until nginx HTML 502). Log the underlying error.

## Non-goals
- Redesigning profile layout
- Changing API key auth semantics

## Acceptance
- [x] Tray shows API keys when entitled/admin
- [x] `/api-keys` works signed-in
- [x] ListKeys cannot hang past ~5s; JSON errors only
- [x] Tests + FE build; commit + push

## Affected paths
- `specs/059-api-keys-tray/spec.md`
- `frontend/src/pages/api-keys/index.astro`
- `frontend/src/config/routes.ts`, `navServices.ts`, `serviceAccess.test.mjs`
- `frontend/src/components/ProfileApiKeys/**`, profile.astro
- `backend/internal/apikeys/dynamo_store.go`, `handlers.go`
