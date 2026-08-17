# Milestone: Church leaders catalog + structured beliefs — 2026-08-17

## Status: SHIPPED

Independent líderes catalog + creencias one-by-one under `eduardoos-next`.

## Leaders catalog

1. **`/church/leaders`** — CRUD: nombre, apellido, teléfono/correo opcionales,
   roles multi-select (option cards, left-aligned).
2. **Permission**: same gate as church register (`approved` +
   `church-management`) or platform admin. Members without permission denied.
3. **Network associations** (`networkIds[]`): always shown for register-gate
   users + platform admin from `/church/groups` catalog. Enough to save a
   leader — churches are optional. Empty church list does **not** block create.
4. **Church associations** (`churchIds[]`): optional when churches exist;
   register-gate users see owned/member denoms; admin sees all.
5. Church register **liderazgo** = dropdown filtered by selected network
   (includes leaders with networks but zero churches). Saving a church appends
   `denominationId/churchId` to each selected leader’s `churchIds`.
6. Persist Dynamo `church-leader:l:{id}` + S3 `church/leaders/{id}/leader.json`.
7. Church JSON stores `leaderIds[]` + denormalized `leaders[]` snapshot.
8. Legacy inline `leaders[]` / name-only leadership still migrates on register.

## Beliefs (creencias)

1. Register as dynamic list (not one blob): heading, key texts (+/− lines),
   full textarea, ↑/↓ reorder.
2. Persist `beliefs[]` on `church.json`; `beliefsDocument` kept as summary /
   legacy fallback.
3. Detail tab + overview show structured list; legacy blob migrates on read.

## Routes

| UI | API |
|----|-----|
| `/church/leaders` | `GET/POST /api/church/leaders` |
| | `PUT/DELETE /api/church/leaders/{id}` |
| `/church/register` | `POST /api/church` (`leadership` ids + `beliefs[]`) |
| `/church/groups` | unchanged |

## Tests

- `go test ./internal/church/...`
- `npm run test:church`
