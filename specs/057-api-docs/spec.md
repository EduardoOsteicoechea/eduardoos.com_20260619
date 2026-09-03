# Feature 057 — API docs (routes, requirements, client prompt)

## Status

**Ready to implement** (2026-09-03).

## Problem

External developers (and API subscribers) need a single place that documents Bearer API-key routes, entitlements, rate limits, and eReport overwrite rules. Today that knowledge lives only in specs/code.

## Goals

### 1. Frontend page
- Path: **`/api-docs`**
- Title: **API docs**
- Public (no JWT required to read)
- BaseLayout + product-dash chrome; plain CSS component
- Documents (human-readable):
  - How to get access (`api` + product entitlements; admin key)
  - Auth: `Authorization: Bearer eos_live_…`
  - Rate limit: 60/min/key → 429 + `Retry-After`
  - **API keys: UI only** (Profile / API keys pages) — do **not** document `/api/apikeys` as external API (spec 061)
  - Each external route as a **card** (not a table) — spec 061
  - eReport v1 **org flow** (spec 060): access → orgs → org reports → get/post with `confirmOverwrite`
  - How to form `ownerSafe` (email → lowercase, `@` → `_at_`)
  - Copyable **agent prompt** for scaffolding a client script + `.env` in another repo (CLI commands one at a time)
- Links: Profile (keys), Subscription

### 2. Backend route
- **`GET /api/v1/docs`** — public JSON catalog (no API key / no JWT)
- Shape: `{ version, baseHint, auth, rateLimit, entitlements, routes: [...] }`
- Same facts as the page; machine-readable for clients

### 3. Discovery
- Tray: public link **API docs** (icon `menu_book` or `terminal`) after Contact in primary links (or end of product list as public — prefer **PRIMARY_TRAY** after Contact so it is always visible)
- Profile API keys section: link “Full API docs”

## Non-goals
- OpenAPI/Swagger UI
- Documenting JWT product routes or key CRUD as external API (keys = UI only; see 061)
- Interactive “try it” console

## Acceptance
- [x] `/api-docs` renders docs + client-agent prompt
- [x] `GET /api/v1/docs` returns JSON catalog (200, no auth)
- [x] Tray + profile link to docs
- [x] Go test for docs endpoint; FE build; commit + push

## Affected paths
- `specs/057-api-docs/spec.md`
- `backend/internal/apikeys/docs.go` (+ mount in `MountV1` or public sibling)
- `backend/cmd/server/main.go` (if needed)
- `frontend/src/pages/api-docs/index.astro`
- `frontend/src/components/ApiDocs/**`
- `frontend/src/config/routes.ts`, `navServices.ts`, ProfileApiKeys
