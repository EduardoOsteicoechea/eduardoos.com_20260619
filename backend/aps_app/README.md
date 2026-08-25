# APS AppBundle — RevitHello (restored)

Restored **verbatim** from Git commit [`f3e41eb`](https://github.com/EduardoOsteicoechea/eduardoos.com_20260619/commit/f3e41eb)
(`fix: target Revit 2027 DA engine for singleRoom.rvt`, 2026-08-06) — the peak
where Design Automation + this robot reviewed a Revit model end-to-end.

This folder is **only** the Autodesk Design Automation AppBundle and helper
scripts. It does **not** restore the pruned gateway routes or `/aps-admin` UI.

## Contents

| Path | Role |
|------|------|
| `RevitHello/` | DA add-in + AppBundle (`ExtractDocumentData` model review robot) |
| `pack-bundle.ps1` | Zip the `*.bundle` folder for upload |
| `register-revit-activity.mjs` | Register / update APS nickname, AppBundle, Activity |

## Usage (offline / direct APS)

1. Set `APS_CLIENT_ID`, `APS_CLIENT_SECRET` (and optional `APS_NICKNAME`) in env.
2. `powershell -File pack-bundle.ps1`
3. `node register-revit-activity.mjs`

See also the earlier relocated copy under `backend/revitapi/` and the HTML guide there.

## Spec

- Restore note: `specs/028-aps-app-restore/spec.md`
- **Client meeting playbook (APS app → robot → ACC Hub → automation on sync):**  
  `specs/029-aps-acc-client-meeting-playbook/spec.md`
- **Live webhook monitor (admin UI + public ingest + SSE):**  
  `specs/030-aps-webhook-monitor/spec.md`  
  Callback: `POST /api/aps/webhooks` · Page: `/product-tests/mps/aps-webhook`
