# Feature 029 — Playbook de reunión: APS app + robot Revit + ACC Hub + automatización al sincronizar

## Status

Active (2026-08-24). **Documento para otro proyecto / facilitador** que guíe una reunión con cliente. No implementa código en Eduardo OS; sintetiza `backend/aps_app/` (pico funcional `f3e41eb`) y el puente hacia Autodesk Construction Cloud (ACC / Forma Data Management).

## Purpose

Entregar un **guion paso a paso exhaustivo** para que, en una reunión con el cliente, se pueda:

1. Crear la **aplicación APS** (Autodesk Platform Services).
2. Crear y publicar el **robot** (Design Automation AppBundle + Activity) que revisa un modelo Revit.
3. Configurar **permisos de Account Admin del Hub ACC** (Custom Integration).
4. Poner una **automatización en el Hub** que dispare revisiones cuando se sincronice / publique **cualquier modelo** relevante del Hub.

Este spec es la fuente de verdad para ese playbook. Si el chat y este documento divergen, gana el spec.

---

## Source of truth in this repo

| Artifact | Path / commit | Role |
|----------|---------------|------|
| Robot + scripts | `backend/aps_app/` | AppBundle `RevitHello`, `pack-bundle.ps1`, `register-revit-activity.mjs` |
| Peak verified run | commit `f3e41eb` (2026-08-06) | Engine `Autodesk.Revit+2027`, input `singleRoom.rvt`, ~37s, JSON OK |
| Narrative guide (HTML) | `backend/revitapi/aps-design-automation-guia.html` | Explicación cliente + técnico (DA only; pre-ACC automation) |
| Historical one-click API | `f3e41eb` → `pkg/aps/`, `internal/svc/gateway/aps.go`, `/aps-admin` | WorkItem + S3 presign (hoy **podado** del producto; patrón a recrear en el proyecto del cliente) |

---

## Glossary (usar en la reunión)

| Término | Explicación para cliente |
|---------|---------------------------|
| **APS** | Plataforma de APIs Autodesk (antes Forge): auth, Design Automation, Data Management, Webhooks. |
| **ACC Hub** | Cuenta / “hub” de Autodesk Construction Cloud (Docs / proyectos). Donde viven los `.rvt` del cliente. |
| **Custom Integration** | Registro del Client ID de la app APS en Account Admin del Hub para que la app pueda leer/escribir datos del Hub. |
| **AppBundle** | ZIP con el add-in Revit (`*.bundle` + DLL) que Autodesk ejecuta en la nube. |
| **Activity** | “Receta”: motor Revit + AppBundle + argumentos (entrada RVT, salida JSON). |
| **WorkItem** | Una ejecución concreta de una Activity sobre un archivo. |
| **Robot / revisión** | En este repo: add-in `RevitHello` → `ExtractDocumentData` escribe `result.json` (IDs de walls/floors/doors/windows/roofs/rooms + título/tamaño/fecha). |
| **dm.version.added** | Evento Webhook APS: nueva versión de un archivo en una carpeta de Docs (p. ej. sync/publish desde Revit). |
| **Engine** | Versión de Revit en la nube, p. ej. `Autodesk.Revit+2027`. El `.rvt` debe ser **≤** esa versión. |

---

## Architecture target (lo que se vende al cliente)

```
Revit Desktop / ACC Sync
        │  publica / sincroniza .rvt al Hub
        ▼
ACC Docs (proyecto / carpeta)
        │  Webhook dm.version.added (o Custom Action / Power Automate)
        ▼
Backend del cliente (HTTPS callback)
        │  filtra .rvt; descarga versión (Data Management / signed URL)
        │  POST Design Automation WorkItem
        ▼
APS Design Automation (Revit engine + AppBundle RevitHello)
        │  escribe result.json
        ▼
Almacén del cliente (S3 / OSS / ACC folder)
        │
        ▼
UI / informe / cola de revisiones
```

**Eduardo OS peak (manual):** usuario admin → `/aps-admin` → WorkItem con RVT ya en S3.  
**Objetivo reunión (automático):** sync al Hub → webhook → mismo robot sin clic.

---

## Meeting agenda (90–120 min sugeridos)

| Bloque | Tiempo | Objetivo de salida |
|--------|--------|--------------------|
| A. Contexto y demo mental | 10 min | Cliente entiende “revisión en nube sin PC” |
| B. Crear app APS | 15–20 min | Client ID + Secret + APIs activadas |
| C. Robot (código → bundle → Activity) | 25–30 min | `APS_ACTIVITY_ID` listo; prueba WorkItem manual |
| D. ACC Hub Admin + Custom Integration | 15–20 min | App instalada en el Hub; scopes claros |
| E. Automatización al sincronizar | 20–25 min | Webhook (o equivalente) + contrato del callback |
| F. Riesgos, costes, siguientes sprints | 10 min | Decisiones firmadas |

---

## Phase A — Framing for the client (script)

**Qué hace el sistema:** procesa un `.rvt` en servidores Autodesk, sin abrir Revit en una workstation, y entrega un JSON de inventario elemental (muros, pisos, puertas, ventanas, techos, habitaciones) + metadatos del archivo.

**Qué no es (aún):** no es un checker de clash BIM 360, no escribe reglas IDS/IFC en este robot base, no sustituye Model Coordination. Es un **robot DA extensible**: hoy inventaria; mañana puede validar parámetros, exportar vistas, generar reportes.

**Coste:** Autodesk Flex / Design Automation tokens por tiempo de CPU Revit en nube. Modelo chico ~30–60 s (verificado ~37 s en `singleRoom.rvt`).

**Seguridad:** Client Secret solo en servidor; WorkItems con URLs firmadas de corta vida; allowlist de quién dispara jobs (en peak: email admin).

---

## Phase B — Create the APS application (step-by-step)

### B0. Prerequisites (checklist before the call)

- [ ] Cuenta Autodesk del **cliente** (o del integrador) con acceso a [APS Developer](https://aps.autodesk.com/) / developer hub.
- [ ] Alguien con rol **Account Admin** del Hub ACC del cliente (para Phase D).
- [ ] Decisión de región ACC (`acc.autodesk.com` vs `acc.autodesk.eu`).
- [ ] Versión(es) de Revit de los modelos del cliente (2025 / 2026 / 2027…). **Un AppBundle+Activity por año de engine.**

### B1. Developer hub + application

1. Entrar a manage.autodesk.com / portal APS → **Developer hub** (crear hub APS si no existe).
2. **Applications → Create application**.
3. Nombre sugerido: `{Cliente}-ModelReview-DA` (o marca del producto).
4. Tipo: app que permita **Design Automation** + **Data Management** + **Webhooks** (y Model Derivative si más adelante se quiere viewer).
5. Callback / redirect URLs:
   - Si solo `client_credentials` (servidor a servidor): puede bastar un redirect placeholder documentado.
   - Si 3-legged (usuario ACC inicia sesión): URL HTTPS real del backend OAuth callback.
6. Guardar y copiar:
   - `APS_CLIENT_ID`
   - `APS_CLIENT_SECRET` (mostrar una sola vez → vault / `.env` / secrets; **nunca** al chat/git).

### B2. APIs / scopes to enable (minimum set)

| API | Para qué |
|-----|----------|
| Authentication | Tokens |
| Design Automation | AppBundle, Activity, WorkItem |
| Data Management | Leer versiones de archivos en ACC / OSS |
| Webhooks | `dm.version.added` (y opc. extraction.*) |
| (Opcional) Model Derivative | Viewer / translation progress |

**Scopes típicos en el script de este repo (2-legged DA + OSS/S3):**

```
code:all data:read data:write data:create bucket:create bucket:read
```

Para ACC Hub + webhooks + descarga de Docs, el proyecto del cliente suele añadir scopes 3-legged / Data Management ACC según tutoriales actuales APS (`data:read`, `account:read`, etc.). **Confirmar en la reunión la matriz exacta** con la doc APS del día (Autodesk cambia nombres de productos: ACC / Forma Data Management).

### B3. Env contract (copy into client project)

```bash
APS_CLIENT_ID=
APS_CLIENT_SECRET=
APS_NICKNAME=            # opcional; default = clientId
APS_ALIAS=dev
APS_ENGINE=Autodesk.Revit+2027
APS_ACTIVITY_ID=         # lo rellena register-revit-activity.mjs
APS_INPUT_ARGUMENT=inputFile
APS_OUTPUT_ARGUMENT=outputFile
APS_INPUT_OBJECT_KEY=    # clave de prueba o path lógico
APS_OUTPUT_FILE_NAME=result.json
APS_OUTPUT_KEY_PREFIX=aps-outputs
APS_S3_BUCKET=           # o bucket OSS APS del cliente
APS_S3_REGION=us-east-1
```

---

## Phase C — Create and publish the robot (from `backend/aps_app`)

### C1. What the robot does (exact behavior)

Entrypoint: `RevitHello.App` (`IExternalDBApplication`) escucha `DesignAutomationReadyEvent`.

1. Abre el `Document` entregado por DA (`data.RevitDoc`).
2. `ExtractDocumentData.Extract()` colecciona:
   - `Title`, `FileSizeBytes`, `LastUpdateUtc`
   - IDs (string) de: Walls, Floors, Doors, Windows, Roofs, Rooms  
     (`FilteredElementCollector` + `WhereElementIsNotElementType`)
3. Serializa JSON **sin** `System.Text.Json` (string builder manual — requisito DA endurecido).
4. Escribe `./result.json` en el working directory del WorkItem.
5. Ante excepción: escribe `{"ok":false,"error":"..."}` y marca `e.Succeeded = false`.

**JSON shape (observable):**

```json
{
  "title": "...",
  "fileSizeBytes": 0,
  "lastUpdateUtc": "2026-...",
  "walls": ["123", "..."],
  "floors": [],
  "doors": [],
  "windows": [],
  "roofs": [],
  "rooms": []
}
```

### C2. Project / pack layout (must match Autodesk)

```
backend/aps_app/
  pack-bundle.ps1
  register-revit-activity.mjs
  RevitHello/
    App.cs
    ExtractDocumentData.cs
    RevitHello.csproj          # net10.0-windows, NuGet Revit 2027 + DA.Revit 2027
    RevitHello.addin           # DBApplication → RevitHello.App
    RevitHello.bundle/
      PackageContents.xml      # SeriesMin/Max R2027, AppType=DBApplication
      Contents/
        RevitHello.dll
        DesignAutomationBridge.dll
        RevitHello.addin
```

**Regla crítica del ZIP:** la raíz del zip debe contener la carpeta `RevitHello.bundle/` (no solo `Contents/` sueltos). `pack-bundle.ps1` valida entradas `*.bundle/`.

### C3. Build + pack (operador en reunión o post-reunión)

```powershell
cd backend/aps_app/RevitHello
dotnet build
cd ..
powershell -ExecutionPolicy Bypass -File .\pack-bundle.ps1
# → RevitHello/RevitHello.zip
```

### C4. Register AppBundle + Activity (script de este repo)

```bash
# desde repo root con .env cargado (o editar loadEnv path en el script del proyecto cliente)
node backend/aps_app/register-revit-activity.mjs
```

El script hace, en orden:

1. `POST /authentication/v2/token` (client_credentials).
2. Opcional: `PATCH /da/us-east/v3/forgeapps/me` nickname.
3. `POST /appbundles` (id `RevitHelloAppBundle`) o `/versions` si 409.
4. Upload multipart del ZIP a `uploadParameters`.
5. Alias `dev` → versión nueva.
6. `POST /activities` id `RevitHelloActivity` con:
   - `engine`: `Autodesk.Revit+2027` (o `APS_ENGINE`)
   - `commandLine`:  
     `$(engine.path)\\revitcoreconsole.exe /i "$(args[inputFile].path)" /al "$(appbundles[RevitHelloAppBundle].path)"`
   - params: `inputFile` verb `get` localName `input.rvt`; `outputFile` verb `put` localName `result.json`
7. Alias activity `dev`.
8. Escribe en `.env`:  
   `APS_ACTIVITY_ID={nick}.RevitHelloActivity+dev`

**IDs canónicos de este repo:**

| Recurso | Id corto | Calificado |
|---------|----------|------------|
| AppBundle | `RevitHelloAppBundle` | `{nick}.RevitHelloAppBundle+dev` |
| Activity | `RevitHelloActivity` | `{nick}.RevitHelloActivity+dev` |

### C5. Manual WorkItem proof (before ACC automation)

Patrón peak Eduardo OS:

1. Subir RVT de prueba al bucket (`APS_INPUT_OBJECT_KEY`, históricamente `singleRoom.rvt` en `aps20250806`).
2. Presign **GET** input + **PUT** output (`aps-outputs/{uuid}/result.json`), TTL ~3600s.
3. `POST https://developer.api.autodesk.com/da/us-east/v3/workitems` con `activityId` + arguments.
4. Poll `GET .../workitems/{id}` hasta `success` / `failed*`.
5. Si falla: abrir `reportUrl` / `failedInstructions` (el peak endureció surfacing de reports).
6. Leer `result.json` del destino PUT.

**Criterio de aceptación Phase C:** un WorkItem `success` y JSON con al menos una categoría no vacía en modelo de prueba.

### C6. Multi-version policy (decide in meeting)

| Decisión | Regla |
|----------|--------|
| Un solo engine | Todos los RVT del Hub ≤ esa versión |
| Varios años | Un AppBundle+Activity **por** `Autodesk.Revit+YYYY`; el callback elige Activity según versión del archivo / metadata |

No mezclar DLLs de años distintos en un solo bundle (`PackageContents` SeriesMin/Max = un año).

### C7. Extending the robot later (backlog, not meeting blocker)

- Reglas de revisión (parámetros faltantes, naming, worksets).
- Export PDF/planos.
- Escritura de issues a ACC Issues API.
- Umbral: capas con opacity 0 no aplican aquí (eso es Scrib); aquí el “filtro” es qué colecta `ExtractDocumentData`.

---

## Phase D — ACC Account Admin + Hub permissions

### D0. Roles required in the room

- [ ] **ACC Account Admin** del Hub del cliente (obligatorio para Custom Integrations).
- [ ] Owner de la app APS (Client ID).
- [ ] (Opcional) Admin de proyectos Docs donde se sincronizan modelos.

### D1. Install Custom Integration (Hub)

1. Abrir ACC → **Account Admin** (hub correcto; US vs EU).
2. Menú **Integrations → Custom Integrations** (si no aparece: abrir una vez **Files/Docs** de un proyecto y reintentar; si sigue ausente, puede requerir activación Docs API / ticket Autodesk con Account ID).
3. **Add custom integration**.
4. Pegar **Client ID** exacto (sin espacios) + nombre visible (`{Cliente} Model Review`).
5. En el diálogo de permisos Autodesk: proceder según política del cliente (Autodesk **no** ofrece granularidad fina en ese warning; el control real es: qué proyectos/miembros ve la app + scopes OAuth).
6. Confirmar estado **Active**.

### D2. Provision access to projects / folders

1. Decidir: ¿service account / app user vs 3-legged user delegado?
2. Invitar la identidad de la integración a **cada proyecto** cuyos Docs deban disparar revisiones.
3. Productos: al menos **Document Management (Docs)** habilitado para ese miembro.
4. Permisos de carpeta: lectura (y si el robot debe dejar informes en Docs: escritura en carpeta `reviews/` o similar).
5. Anotar **Project ID**, **Folder ID(s)** a monitorear (se ven en URL de Docs o vía Data Management API).

### D3. Client decisions to capture in minutes

| Pregunta | Opciones | Decisión |
|----------|----------|----------|
| ¿Quién es dueño del Client Secret? | Cliente / Integrador | |
| ¿2-legged + Custom Integration vs 3-legged? | | |
| ¿Un Hub o varios? | repetir D1 por Hub | |
| ¿Carpeta raíz o solo `/Models`? | Folder IDs | |
| ¿Revisar solo `.rvt` tip / también `.rte` / nubes? | filtro extension | |

---

## Phase E — Hub automation: trigger review on model sync

### E1. Desired business rule

> Cuando **cualquier modelo Revit** del Hub (o de las carpetas acordadas) se **sincronice / publique una nueva versión** en ACC Docs, el sistema encola automáticamente una **revisión Design Automation** con el robot publicado y guarda el resultado.

### E2. Recommended technical pattern (APS Webhooks)

**Evento primario:** `dm.version.added` sobre el **folder** (o árbol) acordado.

Registro (conceptualmente):

1. Backend del cliente expone `POST /webhooks/aps/acc` HTTPS público (TLS).
2. Crear webhook APS (REST / VS Code APS extension / Postman) suscrito a `dm.version.added` con `scope` = folder URN/ID.
3. Callback recibe payload con item/version URN, nombre de archivo, proyecto.
4. Handler:
   1. Verificar firma / secreto webhook si está configurado.
   2. Filtrar: extensión `.rvt` (y opcional tip version only).
   3. (Recomendado) Debounce: ignorar versiones intermedias si llegan ráfagas; procesar tip.
   4. Obtener URL de descarga de la versión (Data Management).
   5. Preparar destino de `result.json` (OSS/S3/Docs).
   6. `POST` WorkItem con `APS_ACTIVITY_ID` y arguments GET/PUT.
   7. Poll o webhook de estado DA; persistir resultado + correlation id.
   8. (Opcional) Notificar Teams/Email/ACC Issue.

**Limitaciones a decir en la reunión (honestidad técnica):**

- `dm.version.added` = “hay nueva versión en Docs”, **no** garantiza que AEC Data Model / Model Properties ya indexó. Para **este** robot DA (abre el RVT en Revit Core Console) suele bastar con que el binario esté disponible para descarga.
- Si más adelante se usa AEC Data Model GraphQL en lugar de DA, hace falta esperar extraction (`elementGroupExtractionStatusAtTip` / polling); no hay webhook universal “index finished” para todo.
- Para translation/viewer: eventos `extraction.finished` / callback en POST version (patrón Model Derivative + ACC) — distinto del robot DA de este repo.

### E3. Alternative patterns (pick one in meeting)

| Patrón | Pros | Contras |
|--------|------|---------|
| **A. Webhooks APS → backend propio** | Control total; mismo patrón peak Eduardo OS | Hay que hostear HTTPS + idempotencia |
| **B. Power Automate + HTTP** | Rápido de demo; poco código | Límites de licencia PA; menos control |
| **C. ACC Custom Actions / Automation UI** (si el Hub del cliente lo tiene) | UX nativa ACC | Cobertura de triggers varía; validar en el Hub real del cliente en la reunión |
| **D. Polling de tip versions** | Simple | Coste/latencia; no recomendado como primario |

**Default recomendado en este spec:** **Patrón A**, con Power Automate solo como demo temporal.

### E4. Callback contract (minimum)

**Input (webhook):** version URN, project id, file name, folder, timestamp.  
**Output (sistema):** `workItemId`, `status`, `resultUri`, `counts` (walls/doors/…), `error`/`reportUrl`.  
**Idempotency key:** `versionUrn` (no re-procesar la misma versión).  
**Observability:** correlation id en logs (estilo Eduardo OS `X-Correlation-ID`).

### E5. Acceptance for Phase E

- [ ] Publicar un `.rvt` / sync desde Revit a la carpeta monitorizada.
- [ ] Llega webhook &lt; N segundos.
- [ ] WorkItem llega a `success` sin clic manual.
- [ ] `result.json` accesible y con inventario coherente.
- [ ] Segunda publish de la misma versión no duplica trabajo (idempotencia).
- [ ] Publish de `.pdf` u otro tipo **no** dispara DA.

---

## Phase F — Risks, cost, and signed decisions

### Risks

| Riesgo | Mitigación |
|--------|------------|
| RVT más nuevo que el engine | Activity por año; detectar versión; mensaje claro |
| WorkItem &gt; timeout HTTP | Submit async + poll (peak: 202 Accepted) |
| Secret en frontend | Nunca; solo servidor |
| Custom Integrations invisible | Account Admin + activar Docs; ticket Autodesk |
| Coste Flex inesperado | Cap de WorkItems/día; cola; solo tip `.rvt` |
| Bundle ZIP mal formado | Validar `*.bundle/` en pack script |

### Non-goals of the first delivery

- UI completa tipo `/aps-admin` (opcional sprint 2).
- Clash / Model Coordination nativo.
- Restaurar gateway APS dentro de Eduardo OS (este playbook es para el **proyecto del cliente**; el código robot vive aquí como referencia).

### Decisions log (fill in meeting)

| # | Decisión | Owner | Date |
|---|---------|-------|------|
| 1 | Engine Revit año(s) | | |
| 2 | Owner APS app + vault Secret | | |
| 3 | Folder IDs a monitorear | | |
| 4 | Patrón automatización A/B/C/D | | |
| 5 | Destino de `result.json` | | |
| 6 | Quién recibe fallos (email/Teams) | | |

---

## Facilitator runbook (minute-by-minute cheat sheet)

1. **Abrir** este spec + `backend/aps_app/README.md` + guía HTML.
2. **Mostrar** diagrama Architecture target.
3. **Crear app** (Phase B) compartiendo pantalla del portal APS del cliente.
4. **Clonar/copiar** `backend/aps_app` al repo del cliente (o submodule); build + pack + register (Phase C).
5. **Probar** un WorkItem manual con un RVT chico.
6. **Account Admin** → Custom Integration (Phase D).
7. **Registrar webhook** `dm.version.added` → callback staging (Phase E).
8. **Sync real** desde Revit y proyectar logs + `result.json`.
9. **Cerrar** con Decisions log + siguiente sprint (reglas de revisión de negocio).

---

## Reference commands (operator)

```powershell
# Build robot
cd backend/aps_app/RevitHello
dotnet build

# Pack (must contain RevitHello.bundle/ in zip)
cd ..
powershell -ExecutionPolicy Bypass -File .\pack-bundle.ps1

# Publish to APS (requires APS_CLIENT_ID/SECRET in .env reachable by script)
node .\register-revit-activity.mjs
```

Design Automation base: `https://developer.api.autodesk.com/da/us-east/v3`  
Auth token: `https://developer.api.autodesk.com/authentication/v2/token`

---

## Acceptance (this documentation feature)

- [x] Spec exhaustivo con fases A–F y checklists de reunión.
- [x] Síntesis fiel de `backend/aps_app` (robot, pack, register, JSON, engine 2027).
- [x] Pasos ACC Custom Integration + automatización por sync (`dm.version.added`) con limitaciones honestas.
- [x] Decisiones y riesgos para acta de cliente.
- [x] Commit + push.

## Affected paths

- `specs/029-aps-acc-client-meeting-playbook/spec.md`
- (referencia read-only) `backend/aps_app/**`, `backend/revitapi/aps-design-automation-guia.html`, commit `f3e41eb`
