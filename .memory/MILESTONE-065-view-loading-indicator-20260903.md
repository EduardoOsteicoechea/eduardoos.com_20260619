# Milestone 065 — View loading indicator (2026-09-03)

## What shipped

Shared `ViewLoading` React + plain CSS: centered Material Symbols `progress_activity` spinner (accent), optional muted label, `role="status"` / `aria-busy`, static icon when `prefers-reduced-motion`.

Wired into `ServiceGate` and full-view loads across eReport, Scrib dashboard, Church hubs, Homescool lists/learning/tasks/calendar, Articles, Pamphlet, Admin users, Profile image, Playlist library, BIM viewer gate, Calvin Institutes reader.

## Spec

`specs/065-view-loading-indicator/spec.md`

## Out of scope (kept as compact text)

Modal/micro statuses (eReport history drawer, Playlist lyrics empty, Scrib sheet line, pamphlet cloud hint).
