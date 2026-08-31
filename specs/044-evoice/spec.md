# Feature 044 — eVoice (text-to-audio + S3 + menu icons)

## Status

**Ready to implement** (2026-08-31) — decisions locked with user.

## Problem

Port the `backend/text-to-audio` (evoice) product into Eduardo OS as a web surface: logged-in entitled users manage projects under S3 `evoice/`, upload convertible docs, generate MP3s via a sandboxed Linux worker on EC2, and play an ordered playlist. Admin sees every user’s tree. Global tray links get Google Material Symbols icons.

Upstream semantics: `backend/text-to-audio/HANDOUT_FOR_EC2_AGENT.md` + converter scripts (docs/audios, one MP3 per stem, regen if missing/outdated). Windows Tk/SAPI is **not** used in production.

## Goals

### 0. Access / subscription
- Catalog id: **`evoice`** — label **eVoice**, $1/mo.
- Access: platform **admin** OR active entitlement OR **temporary allowlist**:
  - `eliasosteic@gmail.com`
  - `laleskavf.2una@gmail.com`
- Allowlist is temporary until PayPal checkout is used; keep in one shared helper (backend + frontend parity).
- Admin bypasses entitlement and may list/open **all** users’ projects.

### 1. Routes (frontend)
| Path | UI |
|------|-----|
| `/evoice` | Project hub for current user (ServiceGate `evoice`) |
| Admin | Same page; owner picker lists all `userSafe` prefixes under `evoice/` |

Nav tray: label **eVoice**, href `/evoice`, `serviceId: "evoice"`.

### 2. S3 (`eduardoos20260607`, prefix `evoice/`)
```
evoice/{userSafe}/                          # ensured on first API use (and empty marker)
evoice/{userSafe}/{project}/docs/<sources>
evoice/{userSafe}/{project}/audios/<stem>.mp3
```
- Bucket confirmed; EC2 role updated by human — also update `deploy/aws/ec2-iam-s3-policy.json` for repo truth.
- Project create writes `docs/` + `audios/` placeholder keys (same pattern as handout).
- Ignore marker name `CREATE_A_FOLDER_BY_GENERATION_PROJECT_BESIDE_THIS_ONE` if present.
- Supported docs: `.docx` `.txt` `.pdf` (text layer) images `.png` `.jpg` `.jpeg` `.webp` `.tif` `.tiff` `.bmp` `.gif`
- One MP3 per convertible source stem; regenerate only if missing or source newer than MP3.

### 3. API (JWT + evoice access)
| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/evoice/me` | Ensure user prefix; `{ userSafe, isAdmin }` |
| GET | `/api/evoice/users` | Admin only — list `userSafe` under `evoice/` |
| GET | `/api/evoice/projects?owner=` | List projects for owner (self or admin) |
| POST | `/api/evoice/projects` | `{ name, owner? }` create docs+audios |
| GET | `/api/evoice/projects/{ownerSafe}/{project}/docs` | List docs |
| POST | `/api/evoice/projects/{ownerSafe}/{project}/docs` | Multipart upload into docs/ |
| DELETE | `/api/evoice/projects/{ownerSafe}/{project}/docs/{name}` | Delete one doc |
| GET | `/api/evoice/projects/{ownerSafe}/{project}/audios` | Playlist metadata + play URLs |
| GET | `/api/evoice/file/{ownerSafe}/{project}/{kind}/{name}` | Stream doc or mp3 (`kind`=docs\|audios) |
| POST | `/api/evoice/projects/{ownerSafe}/{project}/generate` | Start sandbox job → `{ jobId }` |
| GET | `/api/evoice/jobs/{jobId}` | Status + log lines |

Authz: owner of `ownerSafe` or admin. All mutating routes require evoice access (admin/allowlist/entitlement).

### 4. Worker (EC2 host sandbox)
- Go handler downloads project (or syncs) into a temp workdir under `/tmp/evoice-jobs/{jobId}/`.
- Runs Python worker adapted from `converter/scripts` (Linux TTS): prefer **Piper** Spanish voice → ffmpeg mp3; else **espeak-ng** → ffmpeg; OCR via Tesseract when images present.
- Uploads new/updated `audios/*.mp3` to S3.
- Job model: in-process async (status `queued`/`running`/`done`/`failed`); request returns quickly with `jobId`.
- Caps: timeout, max upload size; no GPU assumption.
- Vendor/read scripts from `backend/text-to-audio/converter/scripts` where useful; Linux TTS lives under `backend/internal/evoice/worker/`.

### 5. Web UI
- Project dropdown (taller), create project, upload docs, Generate (progress/log), playlist + HTML5 audio with play/pause/stop/next and auto-advance.
- Fit Eduardo OS plain CSS (component CSS file); ServiceGate wrapper.
- Admin: select any userSafe before project list.

### 6. Global menu icons
- Load already present: Material Symbols Outlined in `BaseLayout.astro`.
- Each tray nav link (primary + product + admin rows) shows a Material Symbol **to the left** of the label.
- Icon map fixed in `navServices` / Header (Contact=mail, Homescool=school, Music=music_note, Pamphlet=description, Scrib=edit_note, eReport=assignment, eVoice=record_voice_over, Articles=article, Calvin’s=menu_book, BIM=view_in_ar, Admin users=group, Agent Sandbox=terminal, MPS=science, Church=church when enabled).

## Non-goals
- Windows Tk / SAPI / `launch.exe` in production.
- Real-time collab; public anonymous bucket access.
- Training custom TTS models.
- Shipping large Piper models in git (install/download on EC2 or document env `EVOICE_PIPER_*`).

## Acceptance
- [x] Spec committed; catalog `evoice` + allowlist + admin bypass
- [x] S3 layout `evoice/{userSafe}/{project}/docs|audios`; IAM policy JSON includes `evoice/`
- [x] API + tests (memory objects); generate job + playlist play URLs
- [x] Page `/evoice` + tray link + Material icons on all tray buttons
- [x] FE build; commit + push

## Affected paths
- `specs/044-evoice/spec.md`
- `backend/internal/evoice/**`, `backend/internal/evoice/worker/**`
- `backend/internal/payments/catalog.go`, `handlers.go` (access allowlist)
- `backend/cmd/server/main.go`
- `deploy/aws/ec2-iam-s3-policy.json`
- `frontend/src/pages/evoice/**`, `components/Evoice/**`, `lib/evoice.ts`, `lib/payments.ts`, `lib/navServices.ts`, `lib/routeAccess.ts`, `config/routes.ts`, `components/Header/**`
- Reference only: `backend/text-to-audio/**` (handout + scripts; not the Windows UI path)
