# Feature 044 — eVoice (text-to-audio + S3 + menu icons)

## Status

**Done** (2026-08-31) — UI chrome cleanup, error modal, playlist stack, premium chapter MP3s, audio 404 fix.

## Problem

Port the `backend/text-to-audio` (evoice) product into Eduardo OS as a web surface: logged-in entitled users manage projects under S3 `evoice/`, upload convertible docs, generate MP3s via a sandboxed Linux worker on EC2, and play an ordered playlist. Admin sees every user’s tree. Global tray links get Google Material Symbols icons.

## Goals (locked)

### Access / Premium
- Catalog `evoice`; admin OR entitlement OR allowlist (`eliasosteic@gmail.com`, `laleskavf.2una@gmail.com`).
- **Premium** checkbox: DeepSeek reasoning rewrite before TTS; writes `docs/<stem>.premium.txt`.
- DeepSeek calls use **`stream: true`** (SSE). Worker logs incremental `PREMIUM <file> pct=N detail=…`.

### Premium → chapter playlist
When **premium** is on, DeepSeek must split the spoken script into **chapters**. The worker generates **one MP3 per chapter** (not a single monolithic file):

- DeepSeek output format (exact markers):
  ```
  <<<CHAPTER n="1" title="Introducción">>>
  …spoken text…
  <<<END>>>
  ```
- Audio keys: `audios/{stem}.c{NN}-{safeTitle}.mp3` (`NN` = zero-padded chapter number; `safeTitle` = lowercase ASCII slug, max 40 chars). Example: `libro.c01-introduccion.mp3`.
- Also write `docs/{stem}.premium.txt` containing the full marked script.
- On premium generate for a stem: remove prior `audios/{stem}.mp3` (legacy single-file) and prior `audios/{stem}.c*.mp3` before writing new chapters.
- Non-premium: still one `audios/{stem}.mp3`.
- **Ready** in Docs: audio present if `{stem}.mp3` **or** any `{stem}.c*.mp3` exists.
- Playlist lists all MP3s sorted by name (chapter files naturally group under the book stem).

### Stop + resume
- **Stop:** `POST /api/evoice/jobs/{jobId}/stop` → state `stopped`, S3 snapshot.
- **Resume:** `POST /api/evoice/jobs/{jobId}/resume` → new job for unfinished files (same premium). Mid-sentence Piper seek not required.
- UI: **Stop generate** while running; **Resume** when stopped.

### Weighted overall progress
**Without premium:** rest 10% | convert 80% | upload 10%.  
**With premium:** rest 10% | extract 30% | refine DeepSeek 30% | convert audio 20% | upload 10%.

### UI layout (hub)
- Vertical gap between **Admin only** and **Project** row (≥1rem).
- **Project** select and **New project** input share the same control height and equal width (side-by-side twin fields; Create stays beside New project).
- Split former Docs panel into:
  1. **Add** — Upload, paste/add text, Premium toggle, Generate (selected docs; if none selected → all). Stop/Resume stay here while a job runs.
  2. **Docs + Playlist** — one two-column section (desktop): **Docs** left, **Playlist** right, same row height (`align-items: stretch`). Stack on narrow viewports.
- **Docs row actions:** per-row **Generate** (label **Regenerate** when audio already present for that stem) + **Delete doc** only (no Delete audio on Docs).
- **Playlist row actions:** Download (text OK) + **Delete** for that MP3.
- **Delete controls** (Docs delete-doc and Playlist delete-audio): **icon-only**, red (Material Symbol `delete`), with `aria-label` / `title`.
- **Console** — full-width panel below the Docs|Playlist row.
- **Premium defaults to on** (DeepSeek speech + chapters).

### Audio fetch (names with spaces / parentheses)
- **Canonical:** `GET|HEAD /api/evoice/file/{ownerSafe}/{project}/{kind}?name=<basename>`  
  and/or **`?key=<full evoice/… key>`** from list metadata (preferred when the client has it — avoids any basename/key drift).
- Basename-only fallback: if `?name=` GetObject misses, list the kind prefix and open the first object whose basename equals `name` (exact, then case-insensitive).
- **Stale `?key=`:** if key is outside the requested owner/project prefix (e.g. admin switched users while playlist still held another owner’s key), **ignore key and use `?name=`** — do not 400 `key outside project`.
- Delete: `DELETE …/docs?name=` / `…/audios?name=` (path `/*` fallback kept).
- Client: playlist/play/download pass `object.key` only when it matches `evoice/{owner}/{project}/{kind}/`; on owner/project change, clear docs/audios/blob immediately before reload.
- Unit tests: query `name`, query `key`, stale-key fallback, and list-recovery after casing mismatch.

### Existing (still required)
- Admin owner sticky; paste text docs; per-file generate; delete doc/audio; job S3 snapshots; stop/resume; Console logs; home lateral pad.

## Non-goals
- Windows Tk/SAPI; true mid-utterance Piper seek-resume.
- Separate Premium catalog SKU.
- Nested S3 folders per book (flat `audios/` with `stem.cNN-…` naming is enough).

## Acceptance
- [x] Stop/resume, DeepSeek SSE, weighted progress (prior slice)
- [x] Audio GET works for names with spaces/parens (no false 404)
- [x] Premium generate → multiple chapter MP3s; playlist shows them
- [x] Docs | Playlist two-column row (Docs left, Playlist right); Console below
- [x] Per-doc label Generate vs Regenerate when audio present; Docs has no Delete audio
- [x] Delete (doc + playlist audio) icon-only red
- [x] No eVoice/Eduardo OS/Documents-to-MP3 heading on the page
- [x] Audio/API errors open ServerErrorModal
- [x] Tests + FE build + commit/push
- [x] Stale cross-owner `?key=` ignored (fallback to name); FE clears playlist on owner/project switch

## Affected paths
- `specs/044-evoice/spec.md`
- `backend/internal/evoice/**`, `worker/linux_sync.py`
- `frontend/src/components/Evoice/**`, `lib/evoice.ts`, `config/routes.ts`
