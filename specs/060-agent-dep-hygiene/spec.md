# Feature 060 — Agent dependency hygiene (no cleanup; reuse installs)

## Status

Active (2026-09-03). Contract for all agents sharing one checkout. Soft rules only (no flock / mutex) — user choice 2A.

## Problem

Simultaneous agents in the same repo race on dependency trees: one runs cleanup / `npm ci` (which **deletes** `node_modules`) while another builds or installs. Processes stumble and leave a half-broken tree. Cleanup should be a **human** action when desired — not an agent “fix.”

## Goals

1. Agents may **install** and **build/test** when required by a gate or the task.
2. Agents **must not** wipe, prune, or “heal” dependency / cache trees unless the user **explicitly** asks in that turn.
3. Prefer **reuse** of an existing install; only install when the tree is missing or the lock/manifest for that stack changed in the work being validated.
4. Apply to **all** stacks in this monorepo (npm, Go modules, Python venvs/pip, and similar), not only frontend.
5. Keep CI’s clean-room `npm ci` on GitHub Actions (spec 005) — that is isolated per job and is **not** a local agent command.

## Non-goals

- File locks / flock / serialized build mutex (deferred; soft rules only).
- Changing CI publish or EC2 recover scripts’ use of `npm ci`.
- Forbidding the **human** from cleaning whenever they want.
- Committing `node_modules`, `.venv`, or Go/module cache contents.

## Forbidden for agents (unless user explicitly asks this turn)

Do **not** run or suggest as a fix:

| Stack | Forbidden examples |
|-------|--------------------|
| npm / frontend | `npm ci` (local), `rm -rf node_modules`, `npm cache clean`, `npm prune` as repair, deleting `package-lock.json` to “regenerate” |
| Go | `go clean -cache`, `go clean -modcache`, `go clean -i` as repair, wiping `$GOMODCACHE` / build cache |
| Python | `rm -rf .venv` / `venv`, `pip cache purge`, bulk-deleting `__pycache__` / `.pytest_cache` as repair |
| General | Any “delete install tree and reinstall from scratch” recovery loop |

If a build fails with a corrupt tree, **report the error and stop** (or fix **source**). Do not auto-clean. The user decides when to clean.

## Allowed install / build policy

### Frontend (extends spec 005 local gate)

Before `git push` when `frontend/**` (or FE publish scripts) changed:

1. If `frontend/node_modules` is **missing** → `cd frontend && npm install`
2. Else if this turn’s changes include `frontend/package.json` or `frontend/package-lock.json` → `cd frontend && npm install`
3. Else → **skip install**; reuse existing `node_modules`
4. Always then: `cd frontend && npm run build`
5. Never use local `npm ci` (CI-only per job)

### Go

- Run `go test` / `go build` as the task requires.
- `go mod download` / `go mod tidy` only when modules are missing or `go.mod` / `go.sum` changed and the task needs it.
- Never clean module or build caches as a repair step.

### Python

- Use existing `.venv` / env when present.
- `pip install -r …` (or project equivalent) only when the env is missing or requirements/lock changed and the task needs it.
- Never wipe the venv or pip cache as a repair step.

### Concurrent agents (soft)

No mutex. Residual races can still happen if two agents `npm install` at once; that is accepted under soft rules. The high-damage case (`npm ci` / `rm -rf node_modules` mid-build) is banned.

## Acceptance

- [x] Spec 005 local gate text no longer mandates `npm ci` for agents.
- [x] `.cursorrules` §10 and `.cursor/rules/auto-commit-push.mdc` match reuse + `npm install` / build-only gate.
- [x] Always-on Cursor rule documents forbidden cleanup for npm / Go / Python.
- [ ] Future simultaneous agents do not wipe shared installs; humans clean on demand.

## Affected paths

- `specs/060-agent-dep-hygiene/spec.md` (this file)
- `specs/005-frontend-gha-dist/spec.md` (local gate)
- `.cursorrules` §10
- `.cursor/rules/auto-commit-push.mdc`
- `.cursor/rules/agent-dep-hygiene.mdc`
