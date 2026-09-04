# Feature 069 — eVoice Super Premium + collapsible hub (no dashboard)

## Status

**Draft** — waiting on locked decisions below. Do not implement until questions are answered.

## Problem

1. Local extract (pypdf / Tesseract) often yields poor speech scripts for hard PDFs/scans; Premium only reformats that bad text.
2. Users want optional **length control** (summarize to a % of original word count) before TTS.
3. The eVoice hub still uses the ProductDashboard card/views model; the product needs a single-page, **collapsible-section** workspace instead.

## Goals (proposed — lock via questions)

### A. Super Premium modality (off by default)

New generate mode **Super Premium**, default **disabled** (unchecked / not selected).

Pipeline (API reality: DeepSeek has no PDF endpoint):

1. Worker still rasterizes PDF/image pages → PNG/JPEG (Python).
2. **DeepSeek Vision** (`deepseek-v4-flash-vision-exp`) extracts text per page (or batched pages).
3. Result is concatenated into a full transcript sidecar (e.g. `docs/{stem}.vision.txt`).
4. Second DeepSeek **text** pass formats for TTS (existing chapter markers when chapters apply), optionally applying the **content %** rule (below).
5. Piper / espeak → ffmpeg → MP3 as today (with versioning — below).

When Super Premium is off, existing Standard / Premium behavior remains.

**Applies to:** PDF + image modalities at minimum. Plain `.txt` / `.docx` may skip Vision and only run the format/summarize pass (TBD in questions).

### B. Content length slider (Documents section)

In the documents / generate controls area, a discrete slider (or stepped control):

| Value | Prompt behavior |
|-------|-----------------|
| **100%** | Do **not** ask to shorten. Prompt asks for faithful full text / spoken script only. |
| **75% / 50% / 25% / 10% / 5%** | Instruct DeepSeek to synthesize so output is about that **percentage of the original word count**. |

Default: **100%**.

Slider is visible in the documents section (with generate actions). Exact coupling to Standard vs Premium vs Super Premium — see questions.

### C. Audio versioning on regenerate

Generate / Regenerate does **not** overwrite blindly in a way that loses history. Each successful generate for a stem produces a new **version** `v1`, `v2`, `v3`, … indefinitely.

Proposed S3 naming (TBD lock):

- Chapters under a version: `audios/{stem}.v{N}.c{NN}-{slug}.mp3`
- Mono (non-chapter): `audios/{stem}.v{N}.mp3`
- Optional sidecar: `docs/{stem}.v{N}.premium.txt` / `.vision.txt`

Legacy `audios/{stem}.mp3` and `audios/{stem}.c*.mp3` remain readable; first Super/versioned generate may treat them as `v1` or leave as “unversioned” (TBD).

### D. UI: leave dashboard model — one page, three collapsible sections

Remove reliance on dashboard cards / multi-`?view=` tool switching for the main workspace (HDS may shrink or only keep Admin / Crawl / Print if still needed — TBD).

Single scrollable page with **collapsible sections** (accordion or independent collapses):

#### 1. Upload controls
- File upload, paste text, project picker chrome as needed, Premium / Super Premium toggles (placement TBD), crawl entry if kept here or elsewhere.

#### 2. Uploaded documents list + action bar + console
- List of uploaded source docs.
- **After selection:** action bar **below** the list: Delete, Generate MP3 (regenerate creates next version).
- **Console** toggleable **to the right** of this section (progress / job logs), not a separate dashboard view.

#### 3. Playlists (nested)
- **Top controls:** play / pause / stop / prev / next for the **full playlist** (all document subsections in order).
- Grouped by **document** (subsection).
  - Per document subsection: controls at the **top** of that group (play that document’s audios).
  - Under each document: **version** sub-subsections (`v1`, `v2`, …).
  - Under each version: chapter/track rows with checkbox.
- Playback rules:
  - If one or more tracks **checked** → play only the selected track(s).
  - If **none** selected in a document subsection → play the whole document subsection (all versions? or latest version only? — TBD).
  - Top bar plays the full ordered playlist across documents.

### Non-goals (proposed)

- DeepSeek native PDF upload (does not exist on API).
- Real-time mic STT (spec 054 remains separate).
- Changing Music admin upload paths.
- Keeping the old card dashboard as the primary eVoice UX.

## Acceptance (draft — finalize after locks)

- [ ] Super Premium toggle exists, **default off**
- [ ] Super Premium path: rasterize → Vision extract → format/summarize → TTS → upload versioned MP3s
- [ ] Content % control: 100 / 75 / 50 / 25 / 10 / 5 with prompt rules above
- [ ] Regenerate creates `vN+1` without deleting prior versions (unless user deletes)
- [ ] Hub is collapsible sections (Upload / Docs+console / Playlists nested), not ProductDashboard cards
- [ ] Playlist: full-bar + per-document controls + checkbox selection behavior
- [ ] Tests + FE build + commit/push

## Affected paths (expected)

- `specs/069-evoice-super-premium-hub/spec.md`
- `frontend/src/components/Evoice/**`
- `frontend/src/lib/evoice.ts`
- `backend/internal/evoice/**`
- `backend/internal/evoice/worker/linux_sync.py`
- Possibly `specs/044-evoice/spec.md` (amend / supersede UI + premium sections)

## Open questions (must lock before Phase 1/2)

1. **Mode control UX** — mutually exclusive radios `Standard | Premium | Super Premium`, or Premium checkbox + separate Super Premium checkbox (Super implies Premium)?
2. **Content % applies when?** (A) Super Premium only (B) Premium + Super (C) all generate modes including Standard (Standard would need a DeepSeek pass just for summarize — confirm)
3. **Super Premium for `.txt` / `.docx`?** Skip Vision and only run summarize/format, or hide Super for those types?
4. **Vision batching** — one page per API call vs multiple images per request (max 600 images/request; cost/quality tradeoff)? Recommended: small batches (e.g. 5–10) or 1/page for reliability.
5. **Page render DPI** for Vision — 150 (current OCR), 200, or 300?
6. **Playlist “none selected”** — play all versions of that document, or **latest version only**?
7. **Full playlist order** — by doc name, then version asc, then chapter; or latest version only per doc in the global bar?
8. **HDS / `?view=`** — remove dashboard + docs/audios/playlists views entirely, or keep Admin / Crawl / Print as HDS icons only?
9. **Default open sections** — all three expanded, or only Upload + Docs open and Playlists collapsed?
10. **Delete behavior** — delete doc deletes all versions of its audio? Delete version? Delete single chapter?
11. **Legacy audios** — map existing `stem.mp3` / `stem.c*.mp3` into playlist as `v1` (unlabeled) or a bucket “Legacy”?
12. **Job API** — extend `POST .../generate` with `superPremium: bool` and `contentPercent: 100|75|50|25|10|5`?

## Dependency note

Spec 054 (audio upload + STT) stays separate and unimplemented until its own locks. This feature does not require 054.
