# Local run — Eduardo OS Next

Run the Next backend and Astro frontend together on dedicated ports so they never collide with production (`:3000` / `:4321` habits).

## Ports

| Process | Port | Notes |
|---------|------|--------|
| Backend | **3001** | `ADDR=:3001` (default in `cmd/server`) |
| Frontend | **4322** | `astro.dev` / `npm run dev`; Vite proxies `/api` and `/health` → `127.0.0.1:3001` |

## Prerequisites

- Go 1.23+
- Node 20+ (or current LTS used by Astro 5)
- Optional: copy `.env.example` → `backend/.env` or export vars in the shell

Default stores are **memory** (`DATABASE_BACKEND=memory`, `EPAMS_BACKEND=memory`, `IFCBIM_BACKEND=memory`). No AWS required for local smoke.

## 1. Backend

```bash
cd eduardoos-next/backend
go test ./...
go run ./cmd/server
```

Health check: [http://127.0.0.1:3001/health](http://127.0.0.1:3001/health)

Useful env (see `.env.example` at the Next root):

```bash
set ADDR=:3001
set JWT_SECRET=change-me
set DATABASE_BACKEND=memory
```

## 2. Frontend

In a second terminal:

```bash
cd eduardoos-next/frontend
npm install
npm run dev
```

Open [http://127.0.0.1:4322](http://127.0.0.1:4322). Browser calls stay same-origin (`/api/...`); the Vite proxy forwards them to the backend.

## Smoke checklist

1. Register / login under `/auth/*` (token key: `eduardoos-next-auth-token`).
2. `/documents/pamphlet` — visual pamphlet generator (create/open local + cloud EPAMs from toolbar).
3. `/media/musica` — list/create playlists (name only).
4. `/bim` — upload real IFC bytes (multipart), list, download; placeholder create still works.
5. `/aps-admin` — admin email only; needs APS credentials for live Autodesk calls.

Optional BIM S3: set `IFCBIM_S3_BUCKET` (or `S3_BUCKET`) plus AWS creds so IFC objects land under `ifcbim/`.

## Build (CI-local)

```bash
cd eduardoos-next/backend && go test ./...
cd ../frontend && npm run build
```

## Isolation

Work only under `eduardoos-next/`. Do not point parent nginx or `deploy.yml` at this tree until `CUTOVER.md` is approved.
