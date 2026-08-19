# Milestone: Selective production CI + manual staging — 2026-08-19

## Status: SHIPPED (updated: FE build on GHA)

### What changed
- **Staging** (`deploy-next-staging.yml`): no longer runs on every `master` push — **workflow_dispatch only**.
- **Production** (`deploy.yml`): detects git diff scopes and sets `DEPLOY_BACKEND` / `DEPLOY_FRONTEND` / `DEPLOY_NGINX`.
- Remote scripts honor those flags; frontend-only skips Go build + docker prune and reloads nginx.
- **Frontend build (2026-08-19):** Astro runs on the GitHub Actions runner (`npm ci` + `astro build` → `frontend-dist.tgz`). EC2 only unpacks and `rsync`s via `deploy/ec2/publish-frontend-dist.sh`. `build-frontend.sh` remains for manual recovery on the host.
- **Pre-push gate:** see [`specs/005-frontend-gha-dist/spec.md`](../specs/005-frontend-gha-dist/spec.md) — if `frontend/**` changed, compile locally before `git push`.

### Path map
| Paths | Scope |
|-------|--------|
| `backend/**` | backend |
| `frontend/**` | frontend (GHA build + upload dist) |
| `nginx/**`, compose files | nginx |
| `deploy/**`, `deploy.yml` | full |
| `.memory`, docs, unrelated | skip remote deploy |
