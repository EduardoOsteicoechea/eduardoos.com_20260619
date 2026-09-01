# Feature 044 — eVoice (text-to-audio + S3 + menu icons)

## Status

**Done** (2026-09-01) — Stop on Console; Upload docs list; playlist prev/next autoplay.

## Problem

Port the `backend/text-to-audio` (evoice) product into Eduardo OS as a web surface: logged-in entitled users manage projects under S3 `evoice/`, upload convertible docs, generate MP3s via a sandboxed Linux worker on EC2, and play an ordered playlist. Admin sees every user’s tree. Global tray links get Google Material Symbols icons.

## Goals (locked)

### Access / Premium
- Catalog `evoice`; admin OR entitlement OR allowlist (`eliasosteic@gmail.com`, `laleskavf.2una@gmail.com`).
- **Premium** checkbox: DeepSeek reasoning rewrite before TTS; writes `docs/<stem>.premium.txt`.
- DeepSeek calls use **`stream: true`** (SSE). Worker logs incremental `PREMIUM <file> pct=N detail=…`.

### Premium → every modality through DeepSeek (mandatory)
When **premium is ON**, **every** convertible source must: (1) extract readable text, then (2) pass that text through DeepSeek **chat completions** with the fixed **`role: system`** speech-prep prompt (`PREMIUM_SYSTEM` in the worker) before any TTS / chapter MP3 generation. No modality may skip DeepSeek when premium is on.

Modalities (non-exhaustive but required):
| Source | Extract path | Then (premium ON) |
|---|---|---|
| Paste / plain **text** (saved `.txt`) | UTF-8 read | DeepSeek `system` + user body → chapters |
| **`.txt` file** | same | same |
| **`.docx`** | python-docx paragraphs/tables | same |
| **PDF with text layer** | pypdf `extract_text` | same |
| **PDF with image / scanned pages** | text layer if rich enough; else **OCR** (render pages → Tesseract `spa+eng`) | same |
| **Image files** (png/jpeg/webp/tiff/bmp/gif) | Tesseract OCR | same |
| Crawl-saved `.txt` | UTF-8 read | same (on generate with premium) |

Rules:
- Extract must succeed with usable text before DeepSeek; empty extract → fail that file (do not TTS raw emptiness; do not skip DeepSeek).
- DeepSeek always uses `messages: [{role:system, content: PREMIUM_SYSTEM}, {role:user, content: extracted…}]`.
- After DeepSeek: write `docs/{stem}.premium.txt`, parse chapter markers, one MP3 per chapter (below).
- When premium is **OFF**, modalities still extract, but TTS uses extracted text directly (single `audios/{stem}.mp3`) — no DeepSeek.

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
- UI: **Stop generate** while a job is running — visible on the generate process chrome (**Console** progress section always when `busy` + `activeJobId`, and also on Upload actions when that panel is open). **Resume** when stopped (same places).

### Weighted overall progress
**Without premium:** rest 10% | convert 80% | upload 10%.  
**With premium:** rest 10% | extract 30% | refine DeepSeek 30% | convert audio 20% | upload 10%.

### Header Dynamic Section (HDS) — icon-only (absolute)
- eVoice mounts tools into `#header-dynamic-menu-host` via `ProductHeaderMenu`.
- **Always, no exception:** HDS buttons are **icon-only** (Google Material Symbols). **No visible text labels** on the buttons.
- Each button has `title` + `aria-label` (accessible name = view label). Active view uses the shared active/pressed chrome.
- Icons map 1:1 to `?view=` entries (dashboard, admin, upload, docs, audios, playlists, print, crawl).

### UI layout (hub)
- Vertical gap between **Admin only** and **Project** row (≥1rem).
- **Project** select and **New project** input share the same control height and equal width (side-by-side twin fields; Create stays beside New project).
- Split former Docs panel into:
  1. **File Uploads** (`?view=upload`) — Upload, paste/+Text, Premium toggle, **Generate all** (and Stop/Resume while a job runs). When paste form is closed / no extra content, panel is compact (no large empty bottom padding).
     - **Uploaded documents (view only):** below the upload controls, show a read-only list of current source docs (name only). **No** checkboxes, **no** Generate/Regenerate, **no** Delete in this list — browsing/confirmation only. Generation actions stay on Docs view.
  2. **Docs + Playlist** — one two-column section (desktop): **Docs** left, **Playlist** right, same row height (`align-items: stretch`). Stack on narrow viewports.
- **Docs row actions:** per-row **Generate/Regenerate** as **icon-only** (Material Symbol `refresh`; `aria-label` Generate vs Regenerate) + **Delete doc** icon-only red. No Delete audio on Docs.
- **Docs footer:** button **Generate selected** (runs only checked docs; disabled when none selected).
- **Playlist row actions:** Download (text OK) + **Delete** icon-only red for that MP3. Per-track playback uses the native `<audio controls>` for the current track.
- **Playlist footer controls** (playlist-level only): **Previous** / Play / Pause / Stop / **Next** / Download — all **icon-only** (`skip_previous`, `play_arrow`, `pause`, `stop`, `skip_next`, `download`), with `aria-label` / `title`.
  - **Next** advances to the next track and **automatically starts playback** of that track (after the blob loads).
  - **Previous** goes to the prior track and **automatically starts playback** of that track.
  - Natural `ended` on the current track behaves like Next (advance + autoplay when a next track exists).
- **Delete controls** (Docs delete-doc and Playlist delete-audio): **icon-only**, red (Material Symbol `delete`), with `aria-label` / `title`.
- **Console** — full-width panel below the active section; while generate runs, shows progress + **Stop generate**; when stopped, **Resume**.
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
- Visible text labels on HDS buttons (forbidden).

## Acceptance
- [x] Stop/resume, DeepSeek SSE, weighted progress (prior slice)
- [x] Audio GET works for names with spaces/parens (no false 404)
- [x] Premium generate → multiple chapter MP3s; playlist shows them
- [x] Docs | Playlist two-column row (Docs left, Playlist right); Console below
- [x] Per-doc Generate/Regenerate icon-only; Docs footer Generate selected; Docs has no Delete audio
- [x] Delete (doc + playlist audio) icon-only red; playlist transport icon-only
- [x] File Uploads panel rename + compact when paste closed
- [x] No eVoice/Eduardo OS/Documents-to-MP3 heading on the page
- [x] Audio/API errors open ServerErrorModal
- [x] Tests + FE build + commit/push
- [x] Stale cross-owner `?key=` ignored (fallback to name); FE clears playlist on owner/project switch
- [x] HDS view buttons are icon-only Material Symbols (no visible text); `title`/`aria-label` present
- [x] Premium ON: txt / docx / PDF-text / PDF-image / image / paste all extract then DeepSeek `system` before TTS
- [x] Scanned/image PDF OCR fallback when text layer is empty/sparse
- [x] Stop generate visible on Console (and Upload) while job runs; Resume when stopped
- [x] Upload view shows read-only uploaded documents list (no generate/delete actions)
- [x] Playlist Previous + Next icon-only; both auto-start playback of the target track

## Affected paths
- `specs/044-evoice/spec.md`
- `frontend/src/components/Evoice/**`
