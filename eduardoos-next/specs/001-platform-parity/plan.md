# Plan — 001 Platform parity

## Architecture

```text
Browser → nginx (cutover later)
            ├─ static: eduardoos-next/frontend/dist
            └─ /api/* → eduardoos-next/backend (host :3000)

backend/
  cmd/server          monolith entry (parity with current cmd/eduardoos role)
  internal/...        handlers by domain
  pkg/...             shared clients (dynamo, s3, aps, auth)

frontend/             Astro + React islands, plain CSS
revitapi/             Revit DA bundle + registration scripts
```

## Tech stack

- Go 1.23, chi, AWS SDK v2
- Astro 5 + React 19, plain CSS, `--site-*` tokens
- Spec Kit artifacts in `.specify/` + `specs/`
- Tests: `go test` per package; frontend checks as packages land

## Phases

### P0 — Scaffold (this PR)
- Folders, constitution, parity spec, data contracts, cutover doc
- Backend: module + `/health` + test
- Frontend: Astro shell + home placeholder
- Revitapi: README placeholder

### P1 — Auth against existing users table
- Login/register/OTP/reset compatible with `sha256:` hashes
- JWT issue/verify

### P2 — Core content APIs
- Epams, playlists, ifcbim list/upload (reuse keys)

### P3 — APS explorer + workitems
- List appbundles, activities, hubs/projects/items
- Keep trigger/poll WorkItem

### P4 — Remaining product surfaces
- Pamphlet UI mount, BIM viewer, music, articles, edebat, subscribe, contact agent

### P5 — Staging deploy path (still not prod)
- Separate compose/systemd unit or port; never overwrite prod `APP_DIR` without cutover

## Testing strategy

For each task: write failing test → implement → green.
Prefer table-driven Go tests; API contract tests for auth and APS list endpoints.

## Risks

- Silent schema drift vs production stores → mitigate with `data-contracts.md` + integration tests against fixtures
- Frontend OOM on small EC2 → heap settings in future deploy scripts under *this* tree only
