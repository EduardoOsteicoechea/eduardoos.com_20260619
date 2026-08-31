# Feature 044 — eVoice (text-to-audio + S3 + menu icons)

## Status

**In progress** (2026-08-31) — follow-up: admin owner list + generate step progress.

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
| Admin | Same page; owner picker lists **all platform users** (not only S3 prefixes that already exist) |

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
| GET | `/api/evoice/users` | Admin only — union of: all `UserStore` emails as `userSafe`, allowlisted emails, and existing S3 prefixes under `evoice/` (sorted unique) |
| GET | `/api/evoice/projects?owner=` | List projects for owner (self or admin) |
| POST | `/api/evoice/projects` | `{ name, owner? }` create docs+audios |
| GET | `/api/evoice/projects/{ownerSafe}/{project}/docs` | List docs |
| POST | `/api/evoice/projects/{ownerSafe}/{project}/docs` | Multipart upload into docs/ |
| DELETE | `/api/evoice/projects/{ownerSafe}/{project}/docs/{name}` | Delete one doc |
| GET | `/api/evoice/projects/{ownerSafe}/{project}/audios` | Playlist metadata + play URLs |
| GET | `/api/evoice/file/{ownerSafe}/{project}/{kind}/{name}` | Stream doc or mp3 (`kind`=docs\|audios) |
| POST | `/api/evoice/projects/{ownerSafe}/{project}/generate` | Start sandbox job → `{ jobId }` |
| GET | `/api/evoice/jobs/{jobId}` | Status + planned steps + progress + log lines |

Authz: owner of `ownerSafe` or admin. All mutating routes require evoice access (admin/allowlist/entitlement).

### 4. Worker (EC2 host sandbox)
- Go handler downloads project into a **disk-backed** workdir (not RAM tmpfs): `EVOICE_WORK_DIR` if set, else `/var/tmp/evoice-jobs/{jobId}/` (never rely on `/tmp` alone — on Amazon Linux `/tmp` is often a small tmpfs and large DOCX→MP3 jobs hit `No space left on device`).
- When spawning the Python worker, set `TMPDIR` to that same disk root so Piper/ffmpeg intermediates do not fill `/tmp`.
- Runs Python worker adapted from `converter/scripts` (Linux TTS): prefer **Piper** Spanish voice → ffmpeg mp3; else **espeak-ng** → ffmpeg; OCR via Tesseract when images present.
- Uploads new/updated `audios/*.mp3` to S3.
- Job model: in-process async (status `queued`/`running`/`done`/`failed`); request returns quickly with `jobId`.
- **Progress plan (required):** on start, backend publishes a fixed ordered `steps[]` plan and updates each step’s state as work advances. Job JSON includes:
  - `steps`: `[{ id, label, state }]` where `state` ∈ `pending` \| `active` \| `done` \| `failed` \| `skipped`
  - `progress`: integer 0–100 (completed weight of the plan)
  - `currentStep`: active step id (or empty when terminal)
  - `logs`: chronological detail lines (streamed live — not only after the Python process exits)
- Default plan steps (ids stable for UI): `prepare` → `download_docs` → `download_audios` → `convert` → `upload` → `finalize`.
- During `convert`, worker streams per-doc lines; Go may refine progress within that step (e.g. docs N of M) without changing the step list shape.
- Caps: timeout, max upload size; no GPU assumption.
- Vendor/read scripts from `backend/text-to-audio/converter/scripts` where useful; Linux TTS lives under `backend/internal/evoice/worker/`.

### 5. Web UI
- Project dropdown (taller), create project, upload docs, Generate, playlist + HTML5 audio with play/pause/stop/next and auto-advance.
- Lead copy does **not** embed the raw `evoice/{userSafe}/` path (keep a short product sentence only).
- **Generate + playlist layout (desktop):** one row with two columns — left **Console** (progress bar, step checklist with state, log); right **Playlist** (tracks + player). Stack vertically on narrow viewports.
- **Download:** each playlist track has a Download control that fetches the authenticated MP3 (`GET /api/evoice/file/.../audios/...`) and saves it locally (filename = object name). Optional “Download current” next to player actions is fine; no zip/bulk required.
- Fit Eduardo OS plain CSS (component CSS file); ServiceGate wrapper.
- Admin: owner picker label **Admin only**; shows the full `/api/evoice/users` list (platform users + allowlist + S3), not only the signed-in admin.

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
- [x] Admin `/api/evoice/users` returns platform users ∪ allowlist ∪ S3 prefixes; owner dropdown shows more than the signed-in admin when other accounts exist
- [x] Generate job exposes `steps` + `progress` (0–100); UI shows progress bar + step list; logs stream during convert (not only at end)
- [x] Playlist tracks can be downloaded as MP3 via authenticated file fetch

## Affected paths
- `specs/044-evoice/spec.md`
- `backend/internal/evoice/**`, `backend/internal/evoice/worker/**`
- `backend/internal/payments/catalog.go`, `handlers.go` (access allowlist)
- `backend/cmd/server/main.go`
- `deploy/aws/ec2-iam-s3-policy.json`
- `frontend/src/pages/evoice/**`, `components/Evoice/**`, `lib/evoice.ts`, `lib/payments.ts`, `lib/navServices.ts`, `lib/routeAccess.ts`, `config/routes.ts`, `components/Header/**`
- Reference only: `backend/text-to-audio/**` (handout + scripts; not the Windows UI path)
