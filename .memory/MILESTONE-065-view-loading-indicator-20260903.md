# Milestone 065 — View loading indicator (2026-09-03)

## What shipped

Shared `ViewLoading` React + plain CSS: centered Material Symbols `progress_activity` spinner (accent), optional muted label, `role="status"` / `aria-busy`, static icon when `prefers-reduced-motion`. **`compact`** variant for modals / panes.

### Pass 1
Wired into `ServiceGate` and full-view loads across eReport, Scrib dashboard, Church hubs, Homescool, Articles, Pamphlet React list, Admin users list, Profile image, Playlist library, BIM viewer gate, Calvin Institutes reader.

### Pass 2 (traverse leftovers)
- Scrib **sheet editor** (“Cargando hoja…”) + Institutes modal Capita/paragraphs
- eReport Historial modal, Playlist lyrics, Admin/Church/Profile API access gates
- Pamphlet generator vanilla cloud/tree hints (`setHintLoading`)

## Spec

`specs/065-view-loading-indicator/spec.md`

## Still text (by design)

Button busy labels; empty/idle copy; AgentSandbox log lines.
