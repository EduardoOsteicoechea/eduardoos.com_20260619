# eReport external API client (spec 062)

Python CLI for Eduardo OS org-scoped eReport API.

## Setup

```bash
cd scripts/eduardoos-ereport
copy .env.example .env   # or cp
# Edit .env — create key at https://eduardoos.com/auth/profile (UI only)
```

## Commands (one at a time)

```bash
python ereport_client.py access
python ereport_client.py orgs
python ereport_client.py org-reports
python ereport_client.py get
python ereport_client.py put --file report.payload.json
```

`get` / `put` print: `Ver reporte: <viewUrl>`

Canonical view URL:

`{BASE}/ereport/workspace?user={ownerSafe}&org={orgId}&report={reportId}`

## Prompts

| File | Purpose |
|------|---------|
| [PROMPT_SDK.md](./PROMPT_SDK.md) | Modes A/B/C for operators + coding agents |
| [prompts/01-api-agent-fechas-al-subir.md](./prompts/01-api-agent-fechas-al-subir.md) | Date round-trip investigation |
| [prompts/02-api-agent-mejorar-instrucciones-y-url.md](./prompts/02-api-agent-mejorar-instrucciones-y-url.md) | Instructions + viewUrl |

Never commit `.env` or API keys.
