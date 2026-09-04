# Feature 068 — eReport validation criteria + docs-first connector

## Status

**Ready to implement** (2026-09-04).

## Problem

1. Issue cards need report-level **validation criteria** (e.g. RVT2025/2026/2027), each generating a quieter accept/reject/disable row above the main trio, with a locked effective-status override rule.
2. Meta labels mix ES/EN; Report Code must be automatic and readonly.
3. The OSS connector hardcodes five CLI commands; agents should learn the live API from an enriched docs catalog so architecture can evolve without connector churn.

## Goals

### 1. Validation criteria (tracker + payload)

- Meta panel (below Report Date / Report Code): editable list of criteria labels → `validationCriteria: string[]`.
- Each open issue card:
  - One quieter criteria row (aceptar / rechazar / no aplica) per label, above the main trio.
  - Main trio always present (bottom-right).
- Per item: keep `status`; add `criteriaStatus: Record<string, "" | "aprobado" | "reprobado" | "no_aplica">`.
- **Effective status** (nav dots, card tone, progress, PDF):

```
if validationCriteria.length === 0 OR any criteriaStatus[label] is unset/"":
  effective = item.status
else:
  if every value is no_aplica → no_aplica
  else if any value is reprobado → reprobado
  else if ≥1 aprobado AND every non-aprobado is no_aplica → aprobado
  else → item.status
```

### 2. Meta labels + Report Code

- Labels: **Report Date**, **Report Code** (readonly).
- Auto every second: `sanitize(reportName || appTitle || "Report") + "_" + YYYYMMDD_HHMMSS` (local).
- Persist as existing key `reportNumber`. Also persist `orgName`, `reportName`/`appTitle`, `reportDate`, `validationCriteria`, item `status` + `criteriaStatus` in `.ereport`, cloud, HTML/PDF export.
- PDF header includes Organization + Report Date + Report Code wording.

### 3. Docs-first API + thin connector

- Expand `GET /api/v1/docs` with `payloadSchema` (full `.ereport` shape, effective-status rules, POST body, full-replace caveat).
- Connector: require API key; `docs` command; generic authenticated `request`; skill directs agents to docs → ordered flow → POST.
- Update skill mirrors + ApiDocs agent prompt.

## Non-goals

- New S3 layout or backend interpretation of criteria (payload stays opaque).
- PATCH of individual items.
- Changing auth model (API key for v1; JWT for site).

## Acceptance

- [x] Spec 068 present and unambiguous
- [x] Tracker: criteria editor, per-issue rows, effective status, Report Date/Code auto
- [x] EmptyPayload + FE types include new fields
- [x] `/api/v1/docs` includes `payloadSchema`
- [x] Connector + skill/ApiDocs docs-first
- [x] Tests pass; FE build; commit + push monorepo (+ connector)

## Affected paths

- `specs/068-ereport-validation-criteria-docs/spec.md`
- `frontend/public/ereport-tracker.html`, `frontend/public/ereport/tracker.html`
- `frontend/src/lib/ereport.ts`
- `backend/internal/ereport/models.go`
- `backend/internal/apikeys/docs.go` (+ tests)
- `.cursor/skills/eduardoos-ereport/**`, `frontend/public/skills/eduardoos-ereport/**`
- `scripts/eduardoos-ereport/**`, `frontend/src/components/ApiDocs/ApiDocsPage.tsx`
- External: `EduardoOsteicoechea/eduardoos-ereport-connector`
