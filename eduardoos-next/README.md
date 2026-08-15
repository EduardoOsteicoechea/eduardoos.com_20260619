# Eduardo OS Next

Greenfield rewrite of Eduardo OS. **Isolated from the production monorepo tree.**

| Folder | Role |
|--------|------|
| `frontend/` | Astro + React (plain CSS) |
| `backend/` | Go API (chi) — same DynamoDB / S3 contracts when ready |
| `revitapi/` | Autodesk APS / Revit Design Automation assets |
| `.specify/` | Spec Kit constitution + process |
| `specs/` | Feature specs → plan → tasks (spec-driven development) |

## Rules (non-negotiable)

1. **Do not modify** sibling production paths (`frontend/`, `cmd/`, `internal/`, `deploy/`, `.github/workflows/deploy.yml` of the parent repo) from this tree’s workstreams.
2. Production keep serving the **current** app until an explicit cutover.
3. Development order: **spec → tests → code → converge**.
4. Reuse existing AWS data (S3 + DynamoDB) by preserving table names, key schemas, and object key prefixes — see `specs/001-platform-parity/`.

## Local quick start (scaffold)

```bash
# Backend
cd backend && go test ./... && go run ./cmd/server

# Frontend (dev proxy: /api and /health → :3001)
cd frontend && npm install && npm run dev
# → http://127.0.0.1:4322
```

## Frontend scaffolding (current)

Usable UI shell with production IA:

- **Libs**: `src/config/routes.ts`, `src/lib/api.ts`, `src/lib/auth.ts` (token key `eduardoos-next-auth-token`), `src/lib/validation.ts`
- **Chrome**: `Header` (Home, Contact, OpenBIM, APS, Personal dropdown), `AuthGate`, `BaseLayout`
- **Auth**: login / register / verify-otp / reset-password forms
- **Contact**: `ContactAgent` (docked optional on home desktop)
- **APS admin**: workitem trigger + registry panel + hub explorer
- **Stubs**: bim, pamphlet, music, articles, edebat, homescool, gallery, subscription, profile

`npm run build` must stay green for frontend changes.

## Cutover

See `CUTOVER.md`. Only after parity checklist is green and staging is stable.
