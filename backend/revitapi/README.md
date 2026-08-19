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

Note: In feature 008 route pruning, public web gateway routes for APS were removed from the active backend server (`main.go`). The standalone AppBundle sources and packaging scripts remain here for Revit Design Automation offline / direct use.
