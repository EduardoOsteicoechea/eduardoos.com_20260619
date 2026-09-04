# Feature 070 — eReport API additive POST (connector cannot mutate issues)

## Status

**Ready to implement** (2026-09-04).

## Problem

API-key POSTs currently full-replace the `.ereport` payload, so agents can overwrite existing issues. Product rule: external API may only **add** open issues (or new sections with new issues), never edit/delete existing asuntos.

## Goals

### API-key POST (`/api/v1/ereport/...` only)

Relative to the stored payload:

1. **Existing sections** (same `id`): title/kind and all **existing items** (same `id`) must be unchanged. Removing a section or item → `400`.
2. **New items** on existing sections: allowed. Each must have non-empty trimmed `incidencia` text and `status` must be `reprobado` (forced if missing/wrong → reject with `400` requiring `reprobado`).
3. **New sections**: allowed; may only contain **new** item ids. Every item in a new section must also have non-empty `incidencia` and `status: reprobado`.
4. Empty new items (no text) → `400`.
5. Root meta fields (`orgName`, `reportName`, `reportDate`, `reportNumber`, `validationCriteria`, `theme`, …) may update from the incoming payload (UI/API metadata); the **sections tree** is additive-only.
6. Server writes the **merged** payload (stored base + validated additions), not a blind client replace.
7. JWT site editor (`/api/ereport/*`) is **unchanged** — full edit remains for the web UI.

### Docs-first propagation

- Update `GET /api/v1/docs` `payloadSchema.writeSemantics` / `agentGuidance` with this rule.
- Skill / CAVEATS / connector README: before any action, fetch docs; POST is additive for issues.

## Non-goals

- PATCH of individual fields
- Changing effective-status / validation-criteria rules (068)
- Blocking meta field updates via API

## Acceptance

- [x] Spec 070 present
- [x] V1 org + legacy POST use additive merge; mutate/delete → 400
- [x] New API items require text + `reprobado`
- [x] Docs + skill/connector updated
- [x] Tests; commit + push monorepo (+ connector skill mirror)

## Affected paths

- `specs/070-ereport-api-additive-post/spec.md`
- `backend/internal/ereport/apimerge.go` (+ tests)
- `backend/internal/ereport/apiv1.go`
- `backend/internal/apikeys/docs.go`
- `.cursor/skills/eduardoos-ereport/**`, `frontend/public/skills/**`
- External connector skill mirror
