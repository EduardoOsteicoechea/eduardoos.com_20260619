# Feature 031 — MPS meeting probes console (MPSAPS-21)

## Status

**Retired (2026-09-01).** Website MPS meeting probes console and admin probe APIs removed. Autodesk APS Design Automation (`backend/aps_app/**`) is unchanged.

## Retirement

Removed from Eduardo OS website usage:

| Surface | Path | Disposition |
|---------|------|-------------|
| FE console | `/product-tests/mps/meeting-probes` | Deleted |
| Header | **MPS tests** → MPS probes | Removed (entire **MPS tests** submenu) |
| BE catalog | `GET /api/admin/aps/probes` | Unmounted + package deleted |
| BE run | `POST /api/admin/aps/probes/{probeId}` | Unmounted + package deleted |
| Nginx | `location ^~ /api/admin/aps/probes` | Removed |
| Env | `PROBE_TIMEOUT_MS`, `APS_HTTP_TIMEOUT_MS`, webhook callback/secret for ingest, `APS_HUB_ID`, `APS_PROJECT_ID`, `APS_REGION` | Dropped from website `.env.example` / deploy (ACC hub leftovers; DA keeps `APS_CLIENT_*` / `APS_ACTIVITY_ID`) |

### Non-goals of retirement

- Do **not** modify `backend/aps_app/**` or other Autodesk APS API / Design Automation code.
- Do **not** remove APS DA credentials used by Design Automation.

## Historical problem (archived)

During live APS/ACC client meetings, independent clickable probes verified auth, hub/Docs access, webhook ingest, and admin parameters.

## Acceptance (retirement)

- [x] Spec marks feature retired; no website UI or admin probe APIs.
- [x] `backend/internal/apsprobes/**` removed; not wired in `cmd/server`.
- [x] FE page, component, header submenu, route constants, and admin path gate removed.
- [x] Nginx probes location removed.
- [x] `backend/aps_app/**` untouched.
