# Prompt 01 — ¿se botan las fechas al subir .ereport?

## Objetivo
Investigar y corregir (o confirmar) si al subir / reemplazar un reporte
(archivo .ereport o PUT/POST full-replace) se vacían `fechaIncidencia` / `fechaSolucion`.

## Evidencia observada
- GET org report devolvió ítems con fechas `""` donde el seed/HTML tenía fechas.
- Cliente externo hace full-replace con `{ "confirmOverwrite": true, "payload": {…} }`.

## Hipótesis
1. Parser/normalizer descarta fechas  
2. Persistencia no guarda esas keys  
3. Default post-load escribe `""`  
4. Bug solo UI `.ereport` vs solo API POST (probar **ambos**)  
5. Formato distinto a lo que acepta el control UI → se sustituye por `""` sin HTTP error  

## Regla
Si el cliente envía fecha no vacía, el GET posterior debe devolver la misma fecha (round-trip).

## Plan mínimo
1. GET → before.json  
2. Setear fechas en un ítem  
3. Subir vía **A)** API POST org y **B)** UI cloud-save / import  
4. GET → contar pérdidas  
5. Fix + test de regresión  

## Diagnóstico producto (2026-09-03 / spec 062)
**Causa raíz UI:** Issue Tracker usa `input type="datetime-local"`. Valores `YYYY-MM-DD` no se muestran; `collectFromDom` escribía `""`.  
**API org POST:** no strippea fechas (test `TestV1OrgReportDateRoundTrip`).  
**Fix:** coerce date-only ↔ datetime-local en `ereport-tracker.html` (+ copia `ereport/tracker.html`).
