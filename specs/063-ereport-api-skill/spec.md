# Feature 063 — Downloadable eReport API Cursor skill

## Status

**Ready to implement** (2026-09-03).

## Problem

Long copy-paste agent prompts on `/api-docs` drift and are hard to reuse across repos. Users want a **downloadable Cursor skill** that configures an agent to open / update / extend eReport issues from **any parseable complaints data**, calling the public rate-limited API with their key.

## Verdict (product)

**Yes — good use case**, with mandatory caveats:
- Skill teaches workflow; it is **not** a patch API (writes are full payload replace).
- API is **rate-limited** (60 req/min/key); skill download is static/public (not rate-limited as a product feature).
- Keys created **only in UI**; never commit secrets.
- Agent may parse arbitrary docs, but must merge into existing `sections/groups/items` schema.
- Owned reports only; entitlements `api` + `ereport`.

## Goals

1. Publish Cursor skill package at **`/skills/eduardoos-ereport/`** (static under `frontend/public/skills/eduardoos-ereport/`):
   - `SKILL.md` — when to use, modes A/B/C, get→merge→put, viewUrl
   - `CAVEATS.md` — downloaders must read (rate limit, full replace, keys, ownership, dates)
   - `reference.md` — endpoints + payload shape (progressive disclosure)
2. Mirror into `.cursor/skills/eduardoos-ereport/` for this monorepo.
3. Refactor `/api-docs` agent section: **install skill first**; short prompt points at skill + caveats (not the old long scaffold-as-primary).
4. Update `scripts/eduardoos-ereport/PROMPT_SDK.md` + README to defer to the skill.
5. Optional: note skill URL in `GET /api/v1/docs` catalog (`skill` field).

## Non-goals
- Marketplace listing / Cursor cloud skill registry
- Separate rate limit for skill file downloads
- True HTTP PATCH of individual items

## Acceptance
- [x] Public files at `/skills/eduardoos-ereport/SKILL.md` (+ CAVEATS, reference)
- [x] Project skill under `.cursor/skills/eduardoos-ereport/`
- [x] ApiDocs prefers skill install + short prompt with caveats
- [x] PROMPT_SDK points to skill
- [x] FE build; commit + push

## Affected paths
- `specs/063-ereport-api-skill/spec.md`
- `frontend/public/skills/eduardoos-ereport/**`
- `.cursor/skills/eduardoos-ereport/**`
- `frontend/src/components/ApiDocs/**`
- `scripts/eduardoos-ereport/PROMPT_SDK.md`, `README.md`
- `backend/internal/apikeys/docs.go` (optional skill URL)
