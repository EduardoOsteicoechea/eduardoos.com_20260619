# Feature 061 — API docs: UI-only keys + route cards

## Status

**Ready to implement** (2026-09-03).

## Problem

1. Public API docs currently list `/api/apikeys` CRUD under “Key management (browser JWT)”. Documenting create/list/revoke as an API surface encourages scripting key lifecycle; that is too dangerous — keys must be managed only in the product UI.
2. External routes are shown in a dense table that is hard to scan; each action should be a readable card.

## Goals

### 1. Key management = UI only (not part of external API docs)
- Remove `keyManagement` from `GET /api/v1/docs` JSON catalog.
- Remove the “Key management (browser JWT)” table/section of endpoint rows from `/api-docs`.
- Replace with a short note: create / list / revoke keys **only** via Profile or the API keys page (`/auth/profile`, `/api-keys`) while signed in — never via external API clients or the published catalog.
- Keep existing JWT routes `/api/apikeys` for the UI to call; do **not** expose them under `/api/v1/*`, and do **not** document them as callable API surface.
- Agent prompt already says create key at profile; keep that (no CLI key CRUD).

### 2. Docs layout — one card per action
- On `/api-docs`, render each entry in `routes` as a **card** (not a table): method badge, path, auth, summary, optional body/requirements.
- Plain CSS in `ApiDocsPage.css`; use site tokens (`--site-border`, `--glassed_background`, `--border_radius_001`).
- Responsive grid/stack so cards are easy to scan on desktop and mobile.

## Non-goals
- Removing JWT `/api/apikeys` handlers (UI still needs them)
- OpenAPI / try-it console
- Changing eReport v1 auth or org flow (060)

## Acceptance
- [x] `GET /api/v1/docs` has no `keyManagement`; `keyPolicy` points to UI for keys
- [x] `/api-docs` has no key-CRUD endpoint list; note + links to Profile / API keys
- [x] Each external route renders as a card
- [x] Tests + FE build; commit + push

## Affected paths
- `specs/061-api-docs-ui-keys-cards/spec.md`
- `specs/057-api-docs/spec.md` (amend key-mgmt goal)
- `backend/internal/apikeys/docs.go` (+ docs tests if any)
- `frontend/src/components/ApiDocs/ApiDocsPage.tsx`
- `frontend/src/components/ApiDocs/ApiDocsPage.css`
