# Milestone: Flatten Eduardo OS Next to repo root — 2026-08-19

## Goal

Single production tree at repo root. Removed legacy monorepo + `eduardoos-next/` wrapper + staging.

## Layout

| Path | Role |
|------|------|
| `frontend/` | Astro (from former `eduardoos-next/frontend`) |
| `backend/` | Go module `eduardoos.nex` (binary still `eduardoos-next`) |
| `deploy/ec2/` | `deploy-remote.sh`, `deploy-remote-production.sh`, `build-frontend.sh` |
| `nginx/` + compose | Mount `./frontend/dist` → html; no `:8080` staging |

## Removed

- Legacy `frontend/`, `cmd/`, `pkg/`, `internal/`, root `go.mod`/`go.sum`, microservices compose/docker
- Staging workflow, staging nginx conf, staging deploy scripts
- Empty `eduardoos-next/` wrapper

## Deploy

- systemd: `WorkingDirectory=$APP_DIR`, `ExecStart=$APP_DIR/backend/bin/eduardoos-next`
- CI scopes: `backend/*`, `frontend/*`, `nginx/*`, `deploy/*`
- Production `.env` stays at `APP_DIR/.env`
