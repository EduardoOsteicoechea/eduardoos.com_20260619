# Milestone: Frontend build on GitHub Actions — 2026-08-19

## Problem
Astro `npm ci` + `astro build` on small EC2 (Graviton) was too slow / prone to thrash.

## Fix
- CI (`.github/workflows/deploy.yml`): when `frontend=1`, Node 22 on ubuntu-latest builds into `dist-build`, verifies critical routes, tars `frontend-dist.tgz`, scp to `/tmp` on EC2.
- EC2: `publish-frontend-dist.sh` unpacks + flock + `rsync --delete` into `frontend/dist` (nginx-safe).
- `deploy-remote-production.sh` no longer runs Node/Astro for production deploys.
- `build-frontend.sh` kept for manual recovery on the host.
- Spec: `specs/005-frontend-gha-dist/spec.md` — before `git push`, if `frontend/**` changed, run `cd frontend && npm ci && npm run build`.
