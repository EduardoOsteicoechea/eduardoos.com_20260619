# Phase 1 Master Plan — Pamphlet Document Generator (Eduardo OS Integration)

**Source prototype:** `document_generator_20260621/` (Python pamphlet-generator, 62 pytest files, own `.git`)

**Goal:** Integrate the spiritual pamphlet editor (JSON → geometry → HTML sheets → browser print PDF) into Eduardo OS as a first-class product surface behind auth, nginx, and flight tracing.

---

## Architecture tension (decide early)

| Layer | Eduardo OS today | Pamphlet prototype |
|-------|------------------|-------------------|
| PDF output | Go `documents` — raw PDF bytes, no external libs | Browser `window.print()` from HTML preview |
| Server | Go chi microservices | Python `ThreadingHTTPServer` |
| UI | Astro + React + plain CSS | Vanilla JS in Python-generated HTML |
| Telemetry | Go `telemetry` + `X-Correlation-ID` | Local `.toon` files + SSE `/stream-telemetry` |

**Recommended strategy:** **Hybrid microservice** — keep the pamphlet *layout engine* in Python (proven TDD, 8-column flow, height engine) but wrap it in Docker, proxy via Go gateway, and rebuild the *editor chrome* in Astro/React using Eduardo OS theming. Defer porting geometry to Go; keep `cmd/documents` for simple programmatic PDFs.

---

## Target user journey

1. Authenticated user opens `/documents/pamphlet` (or `/publish/pamphlet`).
2. Editor loads header / content / footer JSON (from API or S3 draft).
3. Live preview renders letter-landscape sheets (11×8.5 in) with capacity warnings.
4. User edits subideas, images, quotes, lists inline; geometry reflows server-side.
5. Export via browser print (phase 1) or optional server PDF (phase 3+).
6. Save draft / publish to S3; optional DynamoDB metadata per user.

---

## Master checklist (atomic steps)

### Block A — Repo hygiene & discovery

- [ ] **A1** Remove nested `.git` from `document_generator_20260621` OR add as git submodule — pick one before any commit into main repo
- [ ] **A2** Add `document_generator_20260621` to root `.gitignore` temporarily OR move to `services/pamphlets/` canonical path
- [ ] **A3** Run `pytest` in prototype; capture baseline pass count and document port 8000 API map
- [ ] **A4** Inventory JSON schema: `input/header.json`, `content.json`, `footer.json` → publish as `pkg/pamphlet/schema/` or OpenAPI components

### Block B — Docker & networking

- [ ] **B1** Create `docker/pamphlet-service.Dockerfile` (Python 3.12-slim, `pip install -e .`, expose 3000)
- [ ] **B2** Add `pamphlets` service to `docker-compose.yml` on internal port 3000
- [ ] **B3** Add `PAMPHLETS_URL=http://pamphlets:3000` to backend env
- [ ] **B4** EC2 overlay: no extra AWS resources for v1 (stateless; drafts in S3 later)

### Block C — Go gateway (`cmd/backend`)

- [ ] **C1** Add authenticated proxy routes:
  - `GET/POST /api/pamphlets/preview` → preview HTML fragment
  - `GET/POST /api/pamphlets/content` → read/write JSON body
  - `GET /api/pamphlets/telemetry/stream` → SSE pass-through
  - `POST /api/pamphlets/tests/run` → dev-only or admin-gated pytest trigger
- [ ] **C2** Sign `X-Internal-Token` on upstream pamphlet calls; pamphlet service validates (new middleware mirroring `pkg/common`)
- [ ] **C3** Propagate `X-Correlation-ID`; emit flight logs `pamphlet.preview`, `pamphlet.save`
- [ ] **C4** Gateway tests: auth required, correlation header forwarded, 401 without JWT

### Block D — Pamphlet Python service hardening

- [ ] **D1** Refactor `app_server.py` → `cmd/pamphlets/main.py` entry; listen `0.0.0.0:3000`
- [ ] **D2** Add `INTERNAL_SERVICE_SECRET` validation middleware on all routes except `/health`
- [ ] **D3** Replace hardcoded `input/` with per-request JSON body or S3-backed draft ID
- [ ] **D4** Strip `Access-Control-Allow-Origin: *` — only gateway talks to service
- [ ] **D5** Health endpoint `GET /health` for compose healthcheck

### Block E — Astro + React editor (Eduardo OS UI)

- [ ] **E1** Page `frontend/src/pages/documents/pamphlet.astro` + `PamphletEditor.tsx`
- [ ] **E2** Dedicated CSS: sheet preview scale transform, capacity red/green readouts, collapsible telemetry panel
- [ ] **E3** `lib/pamphlets.ts` — API client with JWT + correlation ID
- [ ] **E4** Embed preview iframe or fetch `/api/pamphlets/preview-sheets` HTML fragment
- [ ] **E5** Print button triggers `@media print` on preview (reuse prototype print CSS)
- [ ] **E6** Header nav link under Documents / Publish section
- [ ] **E7** Vitest: API client, `formatCapacity` helpers

### Block F — Persistence (phase 2)

- [ ] **F1** DynamoDB table `eduardoos_pamphlet_drafts` (PK `userId`, SK `draftId`)
- [ ] **F2** S3 prefix `media/pamphlets/{userId}/{draftId}/` for images + JSON snapshot
- [ ] **F3** `GET/POST/DELETE /api/pamphlets/drafts` on gateway → database + s3 coordination

### Block G — CI/CD & ops

- [ ] **G1** `.github/workflows/pamphlets.yml` — `paths: ['services/pamphlets/**']`, pytest in container
- [ ] **G2** Extend `microservices.yml` or add parallel workflow
- [ ] **G3** README section: local pamphlet editor URL, env vars, sample JSON

### Block H — Long-term convergence (optional)

- [ ] **H1** Evaluate server-side PDF via existing `pkg/pdf` for headless export (no browser)
- [ ] **H2** Port mm-to-point math from Python `modules/math` to Go if single-language PDF is required
- [ ] **H3** Unify telemetry: pamphlet SSE events → `telemetry` ingest instead of `.toon` files

---

## Suggested execution order

```
A1–A4  →  B1–B4  →  D1–D5  →  C1–C4  →  E1–E7  →  G1–G3  →  F1–F3  →  H*
```

Python engine first (low risk), then gateway wire-up, then Astro UI, then persistence.

---

## Prototype API surface (port 8000 today)

| Route | Role |
|-------|------|
| `GET /preview` | Full preview page with TDD panel |
| `GET /api/preview-sheets` | HTML sheet fragment (layout query params) |
| `GET /stream-telemetry` | SSE test telemetry |
| `POST /api/run-tests` | Trigger pytest blocks |
| `POST /api/content` | Mutate content JSON |

---

## Risks

1. **Nested git repo** — must resolve before `git add` at monorepo root
2. **PDF strategy split** — product may need both browser print AND server PDF; document which is canonical
3. **Python in Go stack** — adds second runtime; acceptable in Docker, watch EC2 t4g.micro RAM during builds
4. **62 tests** — keep pytest green after every refactor; do not big-bang port to Go

---

## Check-in readiness (2026-06-27)

| Item | Ready? |
|------|--------|
| Worship playlist milestone | ✅ Already on `master` (`de02980`) |
| `.memory` milestone + plan | ✅ This file |
| Commit pamphlet prototype into monorepo | ❌ Blocked on A1 (nested `.git`, path decision) |
| Start Block A | ⏳ Awaiting your go-ahead |

**Proposed next commit (when you say commit):**
```
docs: add milestone and pamphlet generator integration plan

Record worship playlist ship state and Phase 1 plan for integrating
document_generator_20260621 into Eduardo OS as the pamphlets service.
```
