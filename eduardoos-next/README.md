# Eduardo OS Next

Greenfield rewrite of Eduardo OS. **Production cutover complete (2026-08-16):**
`https://eduardoos.com` serves this tree (nginx `:443` + API `:3000`). Staging remains on `:8080` / `:3001`.

| Folder | Role |
|--------|------|
| `frontend/` | Astro + React (plain CSS) — production HTML root |
| `backend/` | Go API (chi) — production host binary on `:3000` |
| `revitapi/` | Autodesk APS / Revit Design Automation assets |
| `.specify/` | Spec Kit constitution + process |
| `specs/` | Feature specs → plan → tasks (spec-driven development) |
| `deploy/` | Staging + production remote scripts (`deploy-remote-*.sh`) |
| `CUTOVER.md` | Cutover record, day-one gaps, rollback |

## Rules

1. Keep DynamoDB table names / S3 contracts stable (see `specs/001-platform-parity/`).
2. Do not rotate `JWT_SECRET` without a coordinated session invalidation plan.
3. Keep legacy parent `frontend/` and `cmd/eduardoos` in git for one-cycle rollback (`bin/eduardoos.prev` on host).
4. Development order: **spec → tests → code → converge**.

## Local quick start

See **[LOCAL.md](./LOCAL.md)** for the full runbook (backend `:3001` + frontend `:4322`).

```bash
# Backend
cd backend && go test ./... && go run ./cmd/server

# Frontend (dev proxy: /api and /health → :3001)
cd frontend && npm install && npm run dev
# → http://127.0.0.1:4322
```

## Frontend scaffolding (current)

Usable UI shell with production IA:

- **Libs**: `src/config/routes.ts`, `src/lib/api.ts`, `src/lib/auth.ts` (token key `eduardoos-next-auth-token`), `src/lib/validation.ts`, `epams` / `playlists` / `bim` clients
- **Chrome**: `Header` (Home, Contact, OpenBIM, APS, Personal dropdown), `AuthGate`, `BaseLayout`
- **Auth**: login / register / verify-otp / reset-password forms
- **Contact**: `ContactAgent` (docked optional on home desktop)
- **APS admin**: workitem trigger + registry panel + hub explorer
- **Wired**: pamphlet visual generator (`src/lib/pamphlet-generator`, mount on `/documents/pamphlet` with cloud EPAMs via `/api/epams`; Print → stub `POST /api/documents/pamphlet/pdf`), music playlist list/create/add-track + HTML5 audio, subscription intents + PayPal hosted button placeholder, OpenBIM upload/list/download of real IFC bytes (memory; optional `IFCBIM_S3_BUCKET`), edebat list/create/turn (memory)
- **Stubs**: articles, homescool, gallery, profile
- **Deferred (accepted day-one gaps)**: That Open / web-ifc 3D viewer; full pamphlet PDF layout parity; PayPal IPN + Dynamo payments/entitlements; edebat LLM referee / S3 persistence

`npm run build` must stay green for frontend changes.

## Deploy / cutover

- **Production**: parent `.github/workflows/deploy.yml` → `deploy/ec2/deploy-remote.sh` → `eduardoos-next/deploy/deploy-remote-production.sh`
- **Staging**: `.github/workflows/deploy-next-staging.yml` → `deploy-remote-staging.sh`
- Details + rollback: **[CUTOVER.md](./CUTOVER.md)**
