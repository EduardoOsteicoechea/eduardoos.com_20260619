# Milestone — Network activities fan-out (2026-08-20)

## Spec
`specs/023-network-activities/spec.md`

## Shipped
- Network activity definition (name + description) under `church/groups/{id}/network-activities/`
- Per-church occurrences (multi same-day) with place, date, reporter, participants, photos, description, contacts
- Soft-delete; member pool union labeled by church; photo compress ≤1MB client-side
- Workspace: Actividades = church forms; new tab Actividades de red = create + read-only rollup

## Paths
- `backend/internal/church/handlers_network_activities.go` (+ test, models, keys, routes)
- `frontend/src/components/Church/ChurchNetworkActivities.tsx`
- `frontend/src/lib/church.ts`, `frontend/src/config/routes.ts`
