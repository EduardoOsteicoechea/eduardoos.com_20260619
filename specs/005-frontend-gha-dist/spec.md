# Feature 005 — Frontend build on GitHub Actions + local pre-push compile

## Status

Shipped in CI (`deploy.yml` + `publish-frontend-dist.sh`). This spec is the contract for agents and humans.

## Problem

Building Astro on small EC2 was too slow. Production now builds on the GitHub Actions runner and uploads a tarball to EC2. Broken frontend commits still waste a full deploy cycle if nobody compiles before push.

## Goals

1. **CI:** when deploy scope includes `frontend`, build Astro on the GHA runner, verify critical routes, upload `frontend-dist.tgz`, and publish on EC2 via `deploy/ec2/publish-frontend-dist.sh` (no `npm`/`astro` on the server for normal deploys).
2. **Local / agent gate:** **before** `git push` to GitHub, if any file under `frontend/` (or deploy scripts that affect the FE publish path) changed in the commit(s) being pushed, **compile the frontend successfully first**.
3. Keep `frontend/dist/` gitignored — never commit the build output.

## Non-goals

- Committing `dist` to the repo.
- Building Astro on EC2 during normal CI (manual recovery via `build-frontend.sh` only).
- Requiring frontend compile when the push touches only `backend/`, docs, `.memory/`, etc.

## Pre-push compile rule (mandatory)

When staging/committing/pushing work that includes changes under:

- `frontend/**`
- and/or `.github/workflows/deploy.yml` / `deploy/ec2/*frontend*` when those changes affect how the FE artifact is built or published

the agent or developer **MUST**, before `git push`:

```bash
cd frontend && npm ci && npm run build
```

(Use `npm ci` when `package-lock.json` is present; otherwise `npm install`.)

- If the build **fails**, **do not push**. Fix and re-run until green.
- If the push is **frontend-only** or mixed with FE changes, this gate applies even when tests were already run earlier in the turn.
- Backend-only / nginx-only / docs-only pushes: skip this gate.

## CI publish contract (reference)

| Step | Where | Action |
|------|--------|--------|
| Scope detect | GHA | `frontend=1` when `frontend/*` (or full deploy) changed |
| Build | GHA ubuntu-latest, Node 22 | `npm ci` + `astro build --outDir dist-build` |
| Verify | GHA | Critical routes (`index.html`, `admin/users`, `church/workspace`, …) |
| Pack | GHA | `frontend-dist.tgz` |
| Upload | GHA → EC2 | `scp` → `/tmp/frontend-dist.tgz` |
| Publish | EC2 | `publish-frontend-dist.sh` → rsync into `frontend/dist` |
| Serve | nginx | `./frontend/dist` → `/usr/share/nginx/html` |

## Acceptance

- [ ] Push with `frontend/**` changes runs local `npm run build` successfully before push (agent/human).
- [ ] Failed local build blocks push.
- [ ] CI still builds on the runner and publishes the tarball; EC2 logs show publish, not `astro build`.
- [ ] `frontend/dist` remains untracked.
