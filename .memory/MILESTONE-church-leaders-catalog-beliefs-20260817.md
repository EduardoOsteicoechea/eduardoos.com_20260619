# Milestone: Church leaders catalog + structured beliefs — 2026-08-17

## Status: SHIPPED

Independent líderes catalog + creencias one-by-one under `eduardoos-next`.

## Leaders catalog

1. **`/church/leaders`** — CRUD: nombre, apellido, teléfono/correo opcionales,
   roles multi-select (option cards, left-aligned).
2. **Permission**: same gate as church register (`approved` +
   `church-management`) or platform admin. Members without permission denied.
3. **Church associations**: register-gate users associate leaders with churches
   they can see (owned denom/network or membership); admin sees all. Persist
   `churchIds[]` as `denominationId/churchId` on leader.json / Dynamo.
4. **Platform admin** also associates each leader with **N networks** from
   `/church/groups` (checkboxes on edit).
5. Church register **liderazgo** = dropdown of catalog (filtered by selected
   network when associations exist; unassigned leaders stay global).
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
