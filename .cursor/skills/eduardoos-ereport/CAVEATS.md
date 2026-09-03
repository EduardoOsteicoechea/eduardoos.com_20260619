# Caveats — downloaders of `eduardoos-ereport`

Read this before installing the skill in another repo or running Mode B/C.

## What this skill is

- Instructions for a **coding agent** to call Eduardo OS’s **public eReport API** with **your** API key.
- Good for: opening/updating/extending Issue Tracker items from **any data the agent can parse** (docs, paste, spreadsheets), merged into an existing org report.

## What this skill is not

- **Not** a true partial PATCH API — every write replaces the **entire** report payload.
- **Not** a way to create/revoke API keys (keys = **UI only**: Profile / API keys).
- **Not** access to someone else’s reports — writes are **owned reports only**.
- **Not** unlimited traffic — API calls are **rate-limited** (60 requests/minute/key → HTTP 429 + `Retry-After`). Downloading these static skill files is separate and not part of that quota.
- **Not** a substitute for opening the report on the website when you need UI chrome, invites, or visual QA (use Mode A).

## Requirements you must arrange

1. Active subscriptions: **`api`** + **`ereport`** (admins still need a key; then product checks may be bypassed).  
2. A key from https://eduardoos.com/auth/profile or `/api-keys` (`eos_live_…`).  
3. Target **orgId** + **reportId** (list via API or from the workspace URL).  
4. `.env` gitignored — **never** commit secrets.

## Data / safety

- Always **get → merge → put**. Putting a thin payload that only lists new issues **wipes** the rest of the report.  
- Preserve dates (`fechaIncidencia` / `fechaSolucion`) and unrelated items.  
- Prefer matching existing item `id`s; ask before inventing new groups.  
- Images in payload can be large (base64); stay under rate limits and timeouts.  
- After put, print `Ver reporte: <viewUrl>` so humans can verify in the browser.

## Liability / expectations

- You are responsible for what your agent writes into your reports.  
- Skill text may lag the live API; prefer `GET https://eduardoos.com/api/v1/docs` if behavior disagrees.  
- Eduardo OS may change routes, limits, or entitlements; pin your client to documented v1 org paths.
