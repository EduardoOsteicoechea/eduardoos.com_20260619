# PROMPT-SDK — eReport (site + API)

Audience: (1) non-technical operators (2) coding agents using `scripts/eduardoos-ereport/`.

Product: Eduardo OS eReport — org hub → reports  
Tool: `ereport_client.py` + `.env` (API key gitignored)

Choose **one mode** at a time.

## 0. Modes

| Mode | Purpose |
|------|---------|
| **A** | Open & edit on the website |
| **B** | Sync via API (`get` → edit → `put`) |
| **C** | Ingest a complaints document → open issues → `put` |

If the report is **not** open on the site yet: Mode A first, then B or C.

## 1. Mode A — Open eReport on the site (non-technical)

1. Sign in at https://eduardoos.com  
2. Open **eReport** (hub: organizations → reports)  
3. Click your organization  
4. Open the report (or create one with a clear title/number)  
5. Edit issues in Issue Tracker: status, incidencia, solución, fechas (`YYYY-MM-DD`)  
6. Copy **Org ID** and **Report ID** (CLI `orgs` / `org-reports`, or from the workspace URL query `org` / `report`)  
7. Tell the agent: “report is open” + paste both IDs into `.env`

Create API key only in UI: https://eduardoos.com/auth/profile or /api-keys

## 2. Mode B — API sync (this repo)

```bash
cd scripts/eduardoos-ereport
copy .env.example .env
python ereport_client.py access
python ereport_client.py orgs
python ereport_client.py org-reports
python ereport_client.py get
# edit report.payload.json
python ereport_client.py put --file report.payload.json
```

Rules: never print the API key; always `get` before `put` (full replace); preserve `fechaIncidencia` / `fechaSolucion` and untouched items; end with `Ver reporte: <viewUrl>`.

## 3. Mode C — Complaints document → open issues

1. Confirm target org/report (Mode A if needed)  
2. `get` payload  
3. Parse doc → map to items (`reprobado` = open)  
4. Merge **in place** (never put a payload that only contains new issues)  
5. `put` + verify; print open ids + `Ver reporte: <viewUrl>`

If dates disappear after put → escalate with `prompts/01-api-agent-fechas-al-subir.md`.

## 4. Copy-paste prompt for coding agents

```
You are operating the Eduardo OS eReport client in this repo:
  scripts/eduardoos-ereport/ereport_client.py
  scripts/eduardoos-ereport/.env   (API key; never print it)

Task: <USER TASK HERE>

Rules:
1) If ORG_ID/REPORT_ID missing or user has not opened the report on the site,
   give Mode A (non-technical) steps and stop before put.
2) Always get before put. put is full payload replace.
3) Preserve fechaIncidencia/fechaSolucion and untouched items.
4) If ingesting a complaints document, use Mode C: structure open issues
   into the existing sections/groups/items; status reprobado = open.
5) End with a short summary and:
   Ver reporte: <url>
   Canonical: {BASE}/ereport/workspace?user={ownerSafe}&org={orgId}&report={reportId}
```

Also see: `prompts/01-…`, `prompts/02-…`, and product `/api-docs`.

## 5. Payload cheat-sheet

Items under `sections[].groups[].items[]` include:
`id`, `status` (`aprobado`|`reprobado`|`no_aplica`), `nombre`, `incidencia`, `solucion`,
`fechaIncidencia`, `fechaSolucion`, `images`, `imagesIncidencia`, `imagesSolucion`.

Keep chrome from `get` when present: `appTitle`, `orgName`, `reportName`, `collapse`, `theme`.
