# Milestone: Homescool calendar + frequency — 2026-08-17

## Status: SHIPPED (this commit)

## Frequency

Assigned tasks store:

```json
"frequency": { "kind": "once|daily|daily_except", "excludeWeekdays": [0,6] }
```

- `once` — calendar shows startDate only
- `daily` — every day in [start, end]
- `daily_except` — daily skipping weekday ints (0=Sun…6=Sat)
- Boards: one card / one submission per assignment
- Calendar: expands occurrences for display

## Calendar

- Sidebar card **Calendar** (virtual folder; teacher + student)
- Library: **FullCalendar v6.1.21** (`react` + `daygrid` + `timegrid`) — stable MIT month/week views, CSS vars → `--site-*`
- Spec: `eduardoos-next/specs/003-homescool-calendar/spec.md`

## Also in this change set

Multi study areas (`studyAreas[]` + legacy `studyArea` migration).

## Tests

- `go test ./internal/homescool/...`
- `npm run test:homescool`
