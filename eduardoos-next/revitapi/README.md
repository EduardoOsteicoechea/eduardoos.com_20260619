# Revit / APS Design Automation assets for Eduardo OS Next

This folder is a **copy** of the parent repo `aps_app/` tree (not a move).
The parent `aps_app/` remains the production source until cutover.

## Contents (copied from `aps_app/`)

| Path | Role |
|------|------|
| `RevitHello/` | Revit Design Automation AppBundle sources |
| `pack-bundle.ps1` | Package the AppBundle zip |
| `register-revit-activity.mjs` | Register / update Autodesk DA activity |

## Backend pairing

Next backend APS routes live under `../backend/internal/aps`:

- `POST /api/aps/trigger-workitem` — requires JWT admin (`eduardooost@gmail.com`) and env:
  `APS_CLIENT_ID`, `APS_CLIENT_SECRET`, `APS_ACTIVITY_ID` (HTTP 503 if missing)
- `GET /api/aps/workitems/{id}`, `GET /api/aps/registry`, hubs/projects/contents

Nothing in this folder is wired into production deploy yet. Update scripts here
first; copy back to parent `aps_app/` only as part of an explicit cutover plan.
