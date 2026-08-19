# Milestone: Consolidate Revit APS assets under backend — 2026-08-19

## Decision

- **Keep** `revitapi` (documented Next copy paired with `backend/internal/aps`).
- **Delete** `aps_app` (duplicate; same AppBundle sources).
- Preserve `aps-design-automation-guia.html` inside the kept tree.

## Layout

`backend/revitapi/` — AppBundle sources, pack/register scripts, DA guide.
