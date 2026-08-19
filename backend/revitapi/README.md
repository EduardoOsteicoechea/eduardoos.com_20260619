# Revit / APS Design Automation assets (Eduardo OS)

Lives under `backend/revitapi/` next to the Go APS routes in `backend/internal/aps`.

## Contents

| Path | Role |
|------|------|
| `RevitHello/` | Revit Design Automation AppBundle sources |
| `pack-bundle.ps1` | Package the AppBundle zip |
| `register-revit-activity.mjs` | Register / update Autodesk DA activity |
| `aps-design-automation-guia.html` | Local DA guide notes |

## Backend pairing

APS HTTP routes (`backend/internal/aps`):

- `POST /api/aps/trigger-workitem` — JWT admin (`eduardooost@gmail.com`) and env:
  `APS_CLIENT_ID`, `APS_CLIENT_SECRET`, `APS_ACTIVITY_ID` (HTTP 503 if missing)
- `GET /api/aps/workitems/{id}`, `GET /api/aps/registry`, hubs/projects/contents

Build/register the AppBundle from this folder when updating Design Automation; the Go server only triggers workitems against the registered activity.
