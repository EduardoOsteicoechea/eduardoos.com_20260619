# Prompt 02 — instrucciones + URL del website

## Objetivo
Unificar instrucciones para **cualquier** org/report:
1. Abrir/crear eReport en el sitio  
2. Editar quejas en la UI  
3. Usar API Bearer (`eos_live_…`) get/put  
4. Al terminar, **siempre** devolver la URL del website de ESE reporte  

## API (orden)
1. `GET /api/v1/ereport/access`  
2. `GET /api/v1/ereport/orgs`  
3. `GET /api/v1/ereport/orgs/{orgId}/reports`  
4. `GET` / `POST /api/v1/ereport/orgs/{orgId}/reports/{reportId}`  
   body put: `{ "confirmOverwrite": true, "payload": {…}, "tema"?: "…" }`  

Base: `https://eduardoos.com`  
Auth: `Authorization: Bearer <API_KEY>` (`api` + `ereport`)  
Keys: **solo UI** (/auth/profile o /api-keys)

## viewUrl canónico (source of truth)

```
{BASE}/ereport/workspace?user={ownerSafe}&org={orgId}&report={reportId}
```

También en JSON de GET/POST org report como `viewUrl` (+ `ownerSafe`, `orgId`, `reportId`).

**Última línea de cualquier run:**
`Ver reporte: <viewUrl>`

## Guías
- Non-tech: Mode A en `../PROMPT_SDK.md`  
- Tech / agente: Mode B–C + copy-paste block en `../PROMPT_SDK.md`  
- Producto: `/api-docs` + `GET /api/v1/docs`
