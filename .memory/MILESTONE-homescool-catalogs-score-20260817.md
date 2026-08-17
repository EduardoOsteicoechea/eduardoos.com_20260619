# Milestone: Homescool catalogs + score 1–5 + padding — 2026-08-17

## Status: SHIPPED (this commit)

Follow-on to `MILESTONE-homescool-tasks-20260817.md`.

## Product UX

### Teacher sidebar catalogs
Buttons to create durable catalogs per teacher:
- **Period**
- **Study area**
- ~~**Times**~~ → removed; duration is fixed presets (see `MILESTONE-homescool-duration-presets-20260817.md`)

Task templates and assign-task filters use **dropdowns** from Period / Study area catalogs
(not free-text). Time uses fixed Spanish presets (`durationMin`).

### Score always 1–5
| Score | Band | Color |
|-------|------|-------|
| 1 | mínimo | red |
| 2 | pobre | yellow |
| 3 | aprobado | pale lime |
| 4–5 | bueno | green |

Score bar is **5 segments**. Max score default/clamp is 5 (was 10).

### Padding alignment
`--homescool-gutter: 0.85rem` shared by:
- Top nav (ALL STUDENTS / HUB)
- Folders sidebar content (symmetric L/R)
- Main pane content

## APIs (JWT, teacher)

| Method | Path | Body / query |
|--------|------|----------------|
| `POST` | `/api/homescool/catalogs` | `{ kind, label }` — kind=`period`\|`study_area` |
| `GET` | `/api/homescool/catalogs` | optional `?kind=` |

## Persistence

DynamoDB (`HOMESCOOL_TABLE` / `eduardoos_catalog`):

```
homescool-cat:t:{teacher}|k:{kind}|id:{id}
```

Same OpenTaskStore backend as templates/tasks (memory locally).

## Tests

- `go test ./internal/homescool/...` (catalog CRUD + score bands 1–5)
- `npm run test:homescool`
