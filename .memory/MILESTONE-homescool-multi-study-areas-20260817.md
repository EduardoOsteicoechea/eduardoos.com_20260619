# Milestone: Homescool multi study areas — 2026-08-17

## Status: SHIPPED (this commit)

Templates and assigned tasks now support **multiple study areas** per item.

## Product UX

- **Task templates** form: Study area is a checkbox multi-picker (catalog labels), not a single `<select>`.
- **Assign tasks** modal: Study areas filter is the same multi-picker (OR match against template areas).
- Period and Time remain single-select; score remains 1–5.
- Cards/modals (templates list, assign cards, teacher/student boards + detail modals) show all areas joined with ` · `.

## API / persistence

- Canonical JSON field: `studyAreas: string[]`
- Deprecated alias: `studyArea: string` (accepted on write; emitted as comma-joined display for older readers)
- DynamoDB / memory: on read, empty `studyAreas` + legacy `studyArea` → one-item array (`NormalizeStudyAreas`)
- List filter `?studyArea=` matches if **any** stored label equals the query (case-insensitive)

## Tests

- `go test ./internal/homescool/...` (normalize + multi create + legacy alias)
- `npm run test:homescool` (normalize/format helpers)
