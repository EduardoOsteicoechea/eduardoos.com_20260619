# Plan: 003 Homescool calendar + frequency

## Implementation order

1. Study areas multi-select (backend migrate + UI) — prerequisite shipped in same change set.
2. Frequency model (`frequency.go`) + Assign handler validation + persistence on `AssignedTask`.
3. Assign modal frequency controls (once / daily / daily_except + weekday excludes).
4. Install FullCalendar v6; Calendar sidebar + `TasksCalendarBoard`.
5. Specs (`specs/003-homescool-calendar/`), memory milestone, README note.
6. Tests → commit → push.

## Files (primary)

### Backend

- `internal/homescool/study_areas.go` / `frequency.go`
- `internal/homescool/tasks.go` (StudyAreas + Frequency fields)
- `internal/homescool/task_handlers.go`, stores, mail

### Frontend

- `src/lib/homescool.ts` (+ tests)
- `AssignTasksModal.tsx`, `TaskTemplatesPanel.tsx`
- `TasksCalendarBoard.tsx`, `HomescoolCalendar.css`
- `StudentSpaceLayout.tsx` (calendar folder branch)
- `TeacherTasksBoard.tsx` / `StudentTasksBoard.tsx` (display frequency + areas)

### Docs

- `specs/003-homescool-calendar/spec.md`
- `.memory/MILESTONE-homescool-multi-study-areas-20260817.md`
- `.memory/MILESTONE-homescool-calendar-frequency-20260817.md`
- `eduardoos-next/README.md`
