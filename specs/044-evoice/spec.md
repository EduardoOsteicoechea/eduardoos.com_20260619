# Feature 044 — eVoice (text-to-audio + S3 + menu icons)

## Status

**Done** (2026-08-31) — stop/resume, DeepSeek SSE stream, weighted progress (premium vs standard).

## Problem

Port the `backend/text-to-audio` (evoice) product into Eduardo OS as a web surface: logged-in entitled users manage projects under S3 `evoice/`, upload convertible docs, generate MP3s via a sandboxed Linux worker on EC2, and play an ordered playlist. Admin sees every user’s tree. Global tray links get Google Material Symbols icons.

## Goals (locked)

### Access / Premium
- Catalog `evoice`; admin OR entitlement OR allowlist (`eliasosteic@gmail.com`, `laleskavf.2una@gmail.com`).
- **Premium** checkbox: DeepSeek reasoning rewrite before TTS; writes `docs/<stem>.premium.txt`.
- DeepSeek calls use **`stream: true`** (SSE). Worker logs incremental `PREMIUM <file> pct=N detail=…` (and optional short `PREMIUM_DELTA` / char counts) so the UI receives analysis progress in parts — not one blocking response.

### Stop + resume
- **Stop:** `POST /api/evoice/jobs/{jobId}/stop` cancels the in-flight job context (kills worker), sets state `stopped`, persists S3 snapshot `evoice/_jobs/{jobId}.json`.
- **Resume:** `POST /api/evoice/jobs/{jobId}/resume` (or UI “Resume”) starts a **new** generate for the same owner/project/premium with `files` = docs still missing/outdated MP3 (and any that were active when stopped). Returns `{ jobId }` of the new job. Mid-sentence Piper resume is **not** required — resume = unfinished files only.
- UI: while generating, show **Stop**; when last job is `stopped` (or after stop), show **Resume**. Keep existing auto-resume-after-backend-death behavior.

### Weighted overall progress
Progress is **not** equal-weight steps. Use these bands (sum 100):

**Without premium**
| Band | Weight | Steps |
|------|--------|--------|
| Rest (prepare + download_docs + download_audios + finalize) | **10%** | early + finalize |
| Convert docs → MP3 | **80%** | `convert` |
| Upload audios to S3 | **10%** | `upload` |

**With premium** (the former 80% convert band is split)
| Band | Weight | Steps / worker phase |
|------|--------|----------------------|
| Rest (prepare + downloads + finalize) | **10%** | early + finalize |
| Convert to speech (extract) | **30%** | `extract_speech` ← EXTRACT lines |
| Refine with DeepSeek | **30%** | `refine_deepseek` ← PREMIUM stream lines |
| Convert to audio (TTS + ffmpeg) | **20%** | `convert_audio` ← TTS/FFMPEG |
| Upload audios to S3 | **10%** | `upload` |

Job `steps[]` labels must match the plan for the job’s `premium` flag. `progress` 0–100 follows the weights above (interpolate within the active band using per-file / phase pct).

### Existing (still required)
- Admin owner sticky; paste text docs; per-file generate; detect ready audios; delete doc/audio; job S3 snapshots; GET job memory-or-S3; Console/Playlist layout; home lateral pad.

## Non-goals
- Windows Tk/SAPI; true mid-utterance Piper seek-resume.
- Separate Premium catalog SKU.

## Acceptance
- [x] Stop cancels worker; job state `stopped`; snapshot persisted
- [x] Resume generates only unfinished files (same premium)
- [x] Premium DeepSeek uses SSE stream; PREMIUM progress lines appear before completion
- [x] Overall progress weights match tables (non-premium 80/10/10; premium 30/30/20 + 10 + 10)
- [x] FE Stop/Resume; tests; commit + push

## Affected paths
- `specs/044-evoice/spec.md`
- `backend/internal/evoice/**`, `worker/linux_sync.py`
- `frontend/src/components/Evoice/**`, `lib/evoice.ts`, `config/routes.ts`
