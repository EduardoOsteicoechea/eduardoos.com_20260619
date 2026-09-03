# eReport API reference (skill companion)

Base default: `https://eduardoos.com`  
Auth: `Authorization: Bearer eos_live_…`

## Ordered endpoints

1. `GET /api/v1/ereport/access`  
2. `GET /api/v1/ereport/orgs`  
3. `GET /api/v1/ereport/orgs/{orgId}/reports`  
4. `GET /api/v1/ereport/orgs/{orgId}/reports/{reportId}` → `viewUrl`, `payload`, …  
5. `POST /api/v1/ereport/orgs/{orgId}/reports/{reportId}`  
   Body: `{ "confirmOverwrite": true, "payload": { /* full .ereport */ }, "tema"?: "…" }`

Alias: `GET /api/v1/ereport/library` → prefer `/orgs` flow.  
Catalog: `GET /api/v1/docs` (no auth).  
Keys: UI only — not part of external API.

## viewUrl

`{BASE}/ereport/workspace?user={ownerSafe}&org={orgId}&report={reportId}`

## Item fields

Under `sections[].groups[].items[]`:

- `id`, `status` (`aprobado` | `reprobado` | `no_aplica`)
- `nombre`, `incidencia`, `solucion`
- `fechaIncidencia`, `fechaSolucion` (`YYYY-MM-DD`, `YYYY-MM-DDTHH:mm`, or `""`)
- `images`, `imagesIncidencia`, `imagesSolucion`

Keep chrome from get when present: `appTitle`, `orgName`, `reportName`, `collapse`, `theme`.
