# Feature 044 — eVoice (text-to-audio + S3 + menu icons)

## Status

**Shipped follow-up** (2026-08-31) — admin owner sticky, paste text, premium DeepSeek speech, durable/resume jobs, convert progress stream.

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

### 0b. Admin owner picker (bugfix)
- Selecting another `userSafe` in **Admin only** must stick: load that owner’s projects/docs/audios and **must not** snap back to the signed-in admin’s `userSafe`.
- Root cause to fix: init `useEffect` must not re-run when `project` / `reloadProjects` identity changes.

### 0.5 Premium speech (DeepSeek reasoning)
- UI checkbox **Premium** on Generate (all / per-doc).
- When on: after text extraction (OCR/docx/pdf/txt/paste) and **before** Piper/ffmpeg, send extracted text to DeepSeek reasoning (`DEEPSEEK_API_KEY`, model `DEEPSEEK_MODEL_REASONING` default `deepseek-v4-pro`) with a fixed system prompt: rewrite for clear spoken Spanish optimized for TTS (short sentences, expand abbreviations, no markdown).
- Persist optimized text as `docs/<stem>.premium.txt` under the project and TTS that text; log `premium: optimized N→M chars`.
- Available to anyone with evoice access (admin/allowlist/entitlement). If API key missing → fail that file with clear log (do not silent-fallback without saying so).

### 1. Job death detection + resume
- Persist each job snapshot under S3 `evoice/_jobs/{jobId}.json` (periodic + on terminal; JSON includes ownerSafe).
- `GET /api/evoice/jobs/{jobId}`: memory first, else S3 snapshot (authz by owner/admin).
- UI: if poll gets 404 **or** backend `/health` fails while generating: wait until health OK, then **auto-resume** by `POST generate` with `files` = docs still missing/outdated MP3 (same premium flag), and continue showing console progress.
- Do not require human to click Generate again after a deploy/restart mid-job.

### 2. Paste text source
- UI: textarea + “Add text” → creates `docs/paste-YYYYMMDD-HHMMSS.txt` (UTF-8) via `POST .../docs/text` `{ "text": "..." }`.
- Then appears in docs list like any other source (Generate all / per-row).

### 3. Constant convert progress
- Worker emits frequent lines during the long convert phase, at least:
  - `FILE name state=active`
  - `EXTRACT name pct=N`
  - `PREMIUM name …` when premium
  - `TTS name pct=N` (chunked)
  - `FFMPEG name …`
  - `FILE name state=done|failed|skipped`
- Go maps these into `files[].progress` / `files[].detail` and overall `progress` so the Console bar moves during TTS, not only between files.

### Routes (frontend)
| Path | UI |
|------|-----|
| `/evoice` | Project hub (ServiceGate `evoice`) |
| Admin | Owner picker lists all platform users |

Nav tray: label **eVoice**, href `/evoice`, `serviceId: "evoice"`.

### S3 (`eduardoos20260607`, prefix `evoice/`)
```
evoice/{userSafe}/
evoice/{userSafe}/{project}/docs/<sources>
evoice/{userSafe}/{project}/audios/<stem>.mp3
evoice/_jobs/{jobId}.json
```
- Supported docs: `.docx` `.txt` `.pdf` images + pasted `.txt`
- One MP3 per stem; regen if missing or source newer.

### API (JWT + evoice access)
| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/evoice/me` | `{ userSafe, isAdmin }` |
| GET | `/api/evoice/users` | Admin: store ∪ allowlist ∪ S3 |
| GET | `/api/evoice/projects?owner=` | |
| POST | `/api/evoice/projects` | `{ name, owner? }` |
| GET/POST/DELETE | `.../docs` | multipart upload |
| POST | `.../docs/text` | `{ text }` paste |
| GET/DELETE | `.../audios` | |
| GET | `/api/evoice/file/...` | stream |
| POST | `.../generate` | `{ files?, premium? }` |
| GET | `/api/evoice/jobs/{jobId}` | memory or S3 |

### Worker
- Disk workdir + TMPDIR; Piper/ffmpeg; Tesseract OCR; `--only`; `--premium` via Go calling DeepSeek then writing `.premium.txt` before TTS, or Python reading premium sibling.
- Prefer: Go extracts or Python extracts; Go runs DeepSeek between extract and TTS by having Python emit EXTRACTED text… Actually cleaner: Python does extract → if premium, call HTTP to local callback OR Go wraps: download → python extract-only → deepseek → write text → python tts-only. Simplest for EC2: Python worker calls DeepSeek REST if `--premium` and env has key (same as Go).

### Web UI
- Owner sticky; paste; Premium checkbox; auto-resume; constant convert progress; existing Console/Playlist/docs rows.

## Non-goals
- Windows Tk/SAPI; mid-sentence Piper resume (resume = re-run unfinished files).
- Separate Premium catalog SKU (toggle only for this phase).

## Acceptance
- [x] Prior ship items
- [x] Admin owner selection does not snap back
- [x] Paste textarea → docs/*.txt
- [x] Premium generate uses DeepSeek then TTS
- [x] Job snapshots; GET after restart; UI auto-resumes
- [x] Convert progress streams during TTS

## Affected paths
- `specs/044-evoice/spec.md`
- `backend/internal/evoice/**`, `worker/**`
- `frontend/src/components/Evoice/**`, `lib/evoice.ts`
