# Spec: Homescool calendar + task frequency — 003

## Summary

Extend Homescool student spaces with:

1. **Multi study areas** on templates and assigned tasks (`studyAreas: string[]`, legacy `studyArea` migrates).
2. **Assignment frequency** persisted on each assigned task (recurrence window = start/end dates).
3. **Calendar** sidebar entry (teacher workspace + student learning) with Teams-like month/week views.

## Frequency model

Stored on `AssignedTask.frequency`:

| `kind` | Meaning | Calendar occurrences |
|--------|---------|----------------------|
| `once` (default) | Specific day / one-shot | `{ startDate }` only; `endDate` is due/conclusion marker |
| `daily` | Every day in window | each day in `[startDate, endDate]` inclusive |
| `daily_except` | Daily minus weekdays | same as daily, skip `excludeWeekdays` (`0=Sun` … `6=Sat`) |

### Board vs calendar semantics

- **Boards (Pendientes / Accionadas / …)**: still **one card per assignment**. Student submits once; teacher grades once for the whole window.
- **Calendar**: expands occurrence dates client-side (and Go helper `ExpandOccurrenceDates` for validation/tests). Caps at 400 days.
- Legacy tasks without `frequency` normalize to `once`.

### Assign API

`POST /api/homescool/students/{slug}/tasks` accepts:

```json
{
  "templateIds": ["…"],
  "startDate": "2026-08-17",
  "endDate": "2026-08-31",
  "frequency": { "kind": "daily_except", "excludeWeekdays": [0, 6] }
}
```

`startDate` is required. Invalid ranges / kinds return 400.

## Calendar library choice

**Chosen: FullCalendar v6 (`@fullcalendar/react` + `@fullcalendar/daygrid` + `@fullcalendar/timegrid` + `@fullcalendar/core`), pinned `6.1.21`.**

### Why FullCalendar (vs react-big-calendar)

| Criterion | FullCalendar v6 | react-big-calendar |
|-----------|-----------------|--------------------|
| Maintenance / downloads | Commercial + OSS; ~1.6M weekly; clear releases | Community MIT; solid but fewer downloads |
| Month + week views | First-class `dayGridMonth` + `timeGridWeek` | Yes, with localizer boilerplate |
| Teams-like toolbar | Built-in headerToolbar (`prev/next/today` + view switch) | Custom toolbar usually required |
| Theming | CSS variables (`--fc-*`) map cleanly to `--site-*` | Heavier default CSS classes |
| Astro + React | Official React wrapper; SSR-safe when client-only | Works; more date-lib coupling (moment/dayjs/luxon) |
| License | MIT for standard plugins (dayGrid/timeGrid) | MIT |

**Not chosen:** FullCalendar v7 yet — packaging moved to theme/plugin imports under `@fullcalendar/react/*` and still evolving; v6 remains the most stable professional fit for this stack today.

### Integration

- Component: `frontend/src/components/Homescool/TasksCalendarBoard.tsx`
- Theme overrides: `HomescoolCalendar.css` (`--fc-*` ← `--site-*`)
- Sidebar virtual folder: `calendar` in `HOMESCOOL_FOLDERS` (not an S3 folder; same pattern as Tasks boards)
- Authz: reuses existing JWT teacher/student task list endpoints
- Event click → `?folder=tasks&task={id}` deep-link

## Study areas (related)

- Canonical: `studyAreas: string[]`
- Deprecated alias: `studyArea` (accepted; emitted joined for display)
- UI: checkbox multi-picker on templates + assign filters
- Period / Time remain single-select; score 1–5 unchanged

## Tests

- `go test ./internal/homescool/...` — study areas normalize/migrate; frequency expand; assign + boards
- `npm run test:homescool` — normalize/format/expand helpers

## Out of scope

- Per-occurrence submissions (one assignment = one response)
- Premium FullCalendar scheduler / resource timelines
- Greek module (untouched)
