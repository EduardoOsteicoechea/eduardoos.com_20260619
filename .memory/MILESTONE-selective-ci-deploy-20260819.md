# Milestone: Selective production CI + manual staging — 2026-08-19

## Status: SHIPPED

### What changed
- **Staging** (`deploy-next-staging.yml`): no longer runs on every `master` push — **workflow_dispatch only**.
- **Production** (`deploy.yml`): detects git diff scopes and sets `DEPLOY_BACKEND` / `DEPLOY_FRONTEND` / `DEPLOY_NGINX`.
- Remote scripts honor those flags; frontend-only skips Go build + docker prune and reloads nginx.

### Path map
| Paths | Scope |
|-------|--------|
| `backend/**` | backend |
| `frontend/**` | frontend |
| `nginx/**`, compose files | nginx |
| `deploy/**`, `deploy.yml` | full |
| `.memory`, docs, unrelated | skip remote deploy |
