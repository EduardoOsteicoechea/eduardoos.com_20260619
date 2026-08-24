# Revit / APS Design Automation assets (Eduardo OS)

Earlier relocated copy of the AppBundle. **Prefer the restored peak snapshot** at
`backend/aps_app/` (from commit `f3e41eb` — see `specs/028-aps-app-restore/spec.md`).

## Contents (this folder)

| Path | Role |
|------|------|
| `RevitHello/` | Revit Design Automation AppBundle sources |
| `pack-bundle.ps1` | Package the AppBundle zip |
| `register-revit-activity.mjs` | Register / update Autodesk DA activity |
| `aps-design-automation-guia.html` | Local DA guide notes |

## Backend pairing

Public gateway routes for APS were pruned (feature 008). AppBundle sources remain
for Design Automation offline / direct use; canonical restore = `backend/aps_app/`.
