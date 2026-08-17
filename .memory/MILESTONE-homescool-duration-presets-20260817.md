# Milestone: Homescool fixed duration presets — 2026-08-17

## Status: SHIPPED (this commit)

Follow-on to `MILESTONE-homescool-catalogs-score-20260817.md`.

## Product UX

### Teacher sidebar catalogs
Buttons to create durable catalogs per teacher:
- **Period**
- **Study area**

**Times removed** — duration is no longer a user-created catalog
(no Times button, no TIME LABEL / MINUTES form).

### Fixed duration presets (task templates / assign UI)
Stored as `durationMin` (minutes equivalent). UI shows Spanish labels.
Codes used in the select: `30m`, `1h`, `2h`, `4h`, `1d`…`6d`, `1w`…`3w`, `1mo`…`12mo`.

| Group | Labels |
|-------|--------|
| Minutes/hours | 30min, 1hr, 2hrs, 4hrs |
| Days | 1 día … 6 días |
| Weeks | 1 semana … 3 semanas |
| Months | 1 mes … 12 meses (1 año) |

Convention: day = 24×60 min, week = 7 days, month ≈ 30 days.

### Unchanged
- Period / Study area catalog create buttons
- Score bar 1–5
- Padding / boards layout

## APIs (JWT, teacher)

| Method | Path | Body / query |
|--------|------|----------------|
| `POST` | `/api/homescool/catalogs` | `{ kind, label }` — kind=`period`\|`study_area` only |
| `GET` | `/api/homescool/catalogs` | optional `?kind=` |
| `POST` | `/api/homescool/task-templates` | includes `durationMin` from preset |

## Tests

- `go test ./internal/homescool/...` (catalog rejects `kind=time`)
- `npm run test:homescool` (duration label helpers)
