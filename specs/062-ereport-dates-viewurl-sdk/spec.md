# Feature 062 — eReport date round-trip, viewUrl, client SDK

## Status

**Ready to implement** (2026-09-03).

## Problem

1. External clients see `fechaIncidencia` / `fechaSolucion` emptied after UI save / .ereport round-trip even when seeds had dates (`YYYY-MM-DD`). Suspected: Issue Tracker `datetime-local` inputs reject date-only values; `collectFromDom` then writes `""`.
2. API docs / agent prompts lack a **canonical website deep link** (`viewUrl`) for a given org report.
3. External repos need a copy-paste PROMPT-SDK (modes A/B/C) + optional client under `scripts/eduardoos-ereport/`.

## Goals

### 1. Date round-trip (never silent wipe)

**Contract per item** under `sections[].groups[].items[]`:
- Keep: `id`, `status`, `nombre`, `incidencia`, `solucion`, `fechaIncidencia`, `fechaSolucion`, `images*`
- Dates: `YYYY-MM-DD` **or** `YYYY-MM-DDTHH:mm` (datetime-local) **or** `""`
- **Rule:** non-empty date in → same semantic date out after PUT/API or UI cloud-save. Never empty without user clearing the field.

**Root cause (to verify in fix):** tracker uses `input type="datetime-local"` with raw `YYYY-MM-DD`; browsers leave the control empty; `collectFromDom` overwrites state with `""`.

**Fix:**
- Coerce date-only → `YYYY-MM-DDT00:00` when binding to `datetime-local`.
- On collect, persist the control value; if time is `00:00`, may normalize back to `YYYY-MM-DD` so date-only seeds round-trip exactly.
- Apply to **both** `frontend/public/ereport-tracker.html` and `frontend/public/ereport/tracker.html` (keep in sync); bump editor cache query `?v=`.
- API org POST: add regression test that fechas survive full-replace (confirm backend does not strip — if only FE bug, test still locks API path).
- Document in changelog / API docs note.

### 2. Canonical `viewUrl`

**Single source of truth** (matches hub `orgReportHref`):

```
{BASE}/ereport/workspace?user={ownerSafe}&org={orgId}&report={reportId}
```

- `ownerSafe` = lowercase email with `@` → `_at_`
- Relative path also useful: `/ereport/workspace?user=…&org=…&report=…`

**API:** `GET`/`POST` org report responses include:
- `viewUrl` (absolute using request host / `X-Forwarded-*` when present, else relative path documented)
- `orgId`, `reportId`, `ownerSafe`
- existing `meta` / `payload` (tema / reportNumber inside)

**Docs:** `/api-docs` + agent prompt + `GET /api/v1/docs` note the formula and “last line: `Ver reporte: <viewUrl>`”.

### 3. Client SDK in this monorepo

Add `scripts/eduardoos-ereport/`:
- `ereport_client.py` — `access`, `orgs`, `org-reports`, `get`, `put --file`
- `.env.example` (no secrets)
- `requirements.txt`
- `README.md` indexing prompts
- `PROMPT_SDK.md` (modes A/B/C + copy-paste agent block)
- `prompts/01-api-agent-fechas-al-subir.md`
- `prompts/02-api-agent-mejorar-instrucciones-y-url.md`

### 4. Product instructions

- Update ApiDocsPage human section + `EREPORT_API_CLIENT_AGENT_PROMPT` for viewUrl + date preserve.
- No separate AGENTS.md exists; put operator/agent guidance in `PROMPT_SDK.md` + api-docs (source of truth for external agents).

## Non-goals
- Partial PATCH API
- Changing status enum labels
- Invite/shared write via API key

## Acceptance
- [x] Tracker: YYYY-MM-DD dates display and survive cloud-save / export collect
- [x] Go test: org POST preserves fechaIncidencia/fechaSolucion
- [x] Org GET/POST JSON includes viewUrl (+ ownerSafe)
- [x] Docs/prompt document viewUrl + Ver reporte rule
- [x] `scripts/eduardoos-ereport/` client + PROMPT_SDK + prompts 01/02
- [x] FE build; commit + push

## Affected paths
- `specs/062-ereport-dates-viewurl-sdk/spec.md`
- `frontend/public/ereport-tracker.html`, `frontend/public/ereport/tracker.html`
- `frontend/src/components/Ereport/EreportEditor.tsx` (cache bust)
- `backend/internal/ereport/apiv1.go`, tests
- `backend/internal/apikeys/docs.go`
- `frontend/src/components/ApiDocs/**`
- `scripts/eduardoos-ereport/**`
