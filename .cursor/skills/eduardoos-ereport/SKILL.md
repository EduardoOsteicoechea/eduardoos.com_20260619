---
name: eduardoos-ereport
description: >-
  Sync Eduardo OS eReport org reports via the public rate-limited API: open or
  edit issues on the website, get/put full payloads with an API key, and ingest
  any parseable complaints document into sections/groups/items. Use when the
  user mentions eReport, Issue Tracker, eduardoos-ereport, eos_live_ keys,
  org reports, or mapping QA/quejas into a remote report.
disable-model-invocation: true
---

# Eduardo OS eReport API skill

**Before first run:** read [CAVEATS.md](CAVEATS.md).  
**Endpoints / payload:** [reference.md](reference.md).  
**Optional CLI:** `scripts/eduardoos-ereport/ereport_client.py` (this monorepo) or any client that follows the same order.

Public skill URL: `https://eduardoos.com/skills/eduardoos-ereport/SKILL.md`

## When to use

- Open / update / extend issues in an **owned** org report from chat, files, or pasted data
- Wire a repo agent to `access → orgs → org-reports → get → put`
- Ingest QA/complaints docs (HTML, JSON, md, spreadsheets, paste) into the live report

## Modes (pick one)

| Mode | Use when |
|------|----------|
| **A** | Report not open yet — guide human on the website |
| **B** | Sync via API key (get → edit payload → put) |
| **C** | Parse any complaints source → merge open issues → put |

If the report is not open on the site: **Mode A first**, then B or C.

### Mode A (non-technical steps for the user)

1. Sign in at https://eduardoos.com  
2. Open eReport → organization → report (or create one)  
3. Copy **Org ID** + **Report ID** (workspace URL `org` / `report` query, or CLI `orgs` / `org-reports`)  
4. Create API key only in UI: `/auth/profile` or `/api-keys`  
5. Put key + ids in `.env` (gitignored). Say “report is open” to the agent.

### Mode B (API)

Env: `EDUARDOOS_BASE_URL`, `EDUARDOOS_API_KEY`, `EDUARDOOS_ORG_ID`, `EDUARDOOS_REPORT_ID`.

Order (separate calls): `access` → `orgs` → `org-reports` → `get` → edit → `put` with `confirmOverwrite: true` and **full** payload.

### Mode C (any parseable data → issues)

1. Confirm org/report (Mode A if needed).  
2. `get` current payload.  
3. Parse user data; map to items (`reprobado` = open).  
4. **Merge in place** — never put a payload that only contains new issues.  
5. `put`; verify; print open ids.

Status map: open/fail/blocked → `reprobado`; done/pass/fixed → `aprobado`; N/A → `no_aplica`.

## Hard rules

1. Never print the API key.  
2. `put` is **full replace** — always `get` first, merge, then `put`.  
3. Preserve `fechaIncidencia` / `fechaSolucion` and untouched items.  
4. Honor **60 req/min/key** (429 + `Retry-After`).  
5. End every successful mutation with:  
   `Ver reporte: <viewUrl>`  
   Canonical: `{BASE}/ereport/workspace?user={ownerSafe}&org={orgId}&report={reportId}`

## Install (downloaders)

Copy this folder to the target project:

```text
.cursor/skills/eduardoos-ereport/
  SKILL.md
  CAVEATS.md
  reference.md
```

Then invoke the skill by name (`eduardoos-ereport`) and give a concrete task.
