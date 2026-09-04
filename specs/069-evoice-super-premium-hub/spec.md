# Feature 069 — eVoice Super Premium + collapsible hub (no dashboard)

## Status

**Implemented** (2026-09-04) — Super Premium Vision path, content %, versioned audios, collapsible hub UI.

## Acceptance

- [x] Radios Standard / Premium / Super Premium; default Standard
- [x] Super: PDF/images Vision@200dpi 1-page/req → format/% → TTS → `vN`; docx Super without Vision
- [x] Content % on all modes; 100% = no shorten instruction
- [x] Versioned MP3s; Legacy bucket for old names
- [x] Collapsible Upload / Docs+console / Playlists; 80vh + Show more
- [x] Playback selection rules as locked
- [x] Delete doc ≠ delete audio
- [x] Generate API `mode` + `contentPercent`
- [x] No view HDS; admin = top owner dropdown; crawl = upload modality; print = selected-doc prepared-speech action
- [x] Tests + FE build + commit/push

## Problem

1. Local extract (pypdf / Tesseract) often yields poor speech scripts for hard PDFs/scans; Premium only reformats that bad text.
2. Users want optional **length control** (summarize to a % of original word count) before TTS.
3. The eVoice hub still uses the ProductDashboard card/views model; the product needs a single-page, **collapsible-section** workspace instead.

## Locked decisions

| # | Decision |
|---|----------|
  | 1 | Mode UX: mutually exclusive **Quality** slider **`Standard` \| `Premium` \| `Super Premium`**. Default = **Premium**. |
| 2 | **Content %** applies to **all** generate modes. |
| 3 | **Super Premium** only for **PDF, images, and `.docx`**. Not for plain `.txt` (those use Standard/Premium only). |
| 4 | Vision: **1 page per API request** (reliability over batching). |
| 5 | Page render DPI for Vision: **200**. |
| 6–7 | Playback selection rules — see Playlist below. |
| 9 | All three sections **open** by default; workspace column max **80vh**, `overflow-y: auto`, with a **Show more** control that expands height to fit the playlist / content. |
| 10 | **Delete doc does not delete audio** (and vice versa). Docs and audios are independent. |
| 11 | Pre-version MP3s appear under a **Legacy** bucket (not auto-renamed to `v1`). |
| 12 | Extend existing generate job API (see API). |
| 8 | **No dashboard / no view-switching HDS** for Upload/Docs/Audios/Playlist/Crawl/Print. See UI chrome below. |

### Super Premium pipeline (PDF / images)

1. Rasterize each page @ **200 DPI** → PNG/JPEG (Python; DeepSeek has no PDF endpoint).
2. **DeepSeek Vision** (`deepseek-v4-flash-vision-exp`): **one page image per request** → page text.
3. Concatenate → `docs/{stem}.v{N}.vision.txt` (or equivalent sidecar).
4. DeepSeek **text** pass: format for TTS + content-% rule → chapters when Premium-style chapters apply → `docs/{stem}.v{N}.premium.txt`.
5. Piper / espeak → ffmpeg → versioned MP3s.

### Super Premium for `.docx`

No Vision (no page images). Extract text via python-docx, then same DeepSeek format/summarize pass + TTS + versioning. (If this is wrong and docx should be refused for Super, say so.)

### Content % (all modes)

Discrete control: **100% / 75% / 50% / 25% / 10% / 5%**. Default **100%**.

| Value | Behavior |
|-------|----------|
| **100%** | Do not ask to shorten. Faithful full text / spoken script. |
| **75–5%** | DeepSeek must synthesize to about that **% of original word count**. |

Implications:

- **Standard + 100%**: extract → TTS (no DeepSeek), same spirit as today.
- **Standard + &lt;100%**: extract → DeepSeek summarize-only (no chapter requirement unless we keep chapters — **use chapter markers whenever DeepSeek runs**, for playlist consistency) → TTS.
- **Premium / Super**: DeepSeek format (+ summarize if &lt;100%) → chapters → TTS.

### Audio versioning

Each successful generate for a stem creates **`v{N+1}`** (N starts at 1 for first versioned generate). Does not overwrite prior versions.

Naming:

- Mono: `audios/{stem}.v{N}.mp3`
- Chapters: `audios/{stem}.v{N}.c{NN}-{slug}.mp3`
- Sidecars: `docs/{stem}.v{N}.vision.txt`, `docs/{stem}.v{N}.premium.txt` as applicable

**Legacy** (no `.vN.` in name): `audios/{stem}.mp3`, `audios/{stem}.c*.mp3` — listed under playlist bucket **Legacy**, not migrated.

### UI chrome

- **No** ProductDashboard cards and **no** view-switching HDS icons for Upload/Docs/etc.
- **Admin:** HDS **icon-only** button (admin users only) opens a **modal** with the owner dropdown. Non-admins never see it. No inline “Owner (admin)” field on the page.
- **Crawl / paste / file:** Upload section has three modality **buttons**. Each modality’s input UI is **hidden until** that button is pressed (mutually exclusive panels).
- **Print:** document action — prepared speech for selected docs.

### UI — four collapsible sections (each with distinct section background)

1. **Project** — project select + new project create.
2. **Upload** — modality buttons (Upload file / Paste text / Crawl); panel for the active modality only.
3. **Documents** — list; action bar: icon-only **Generate** (left), **Print** (middle), **Delete** (right, red icon); **Quality** slider (Standard → Premium → Super Premium); **Content %** slider (100/75/50/25/10/5). Console toggleable to the right.
4. **Playlists** — nested structure (document → version/Legacy → tracks).

### UI polish (2026-09-04)

- **Upload** modality controls are **icon-only** (file / text / spider for crawl).
- **Documents:** no explanatory subtitle; per-row **delete** icon; **Console** is an icon button in the section header (top right); action bar has **Quality** + **Content %** sliders (defaults: **Premium**, **100%**) then **Print** + **Generate** icons on the **right** (no bulk delete in the bar).
- **HDS:** admin owner modal (admins) + **collapse/expand workspace** icon toggle (collapses all sections).

#### Playlist nesting & playback (locked)

```
[ Global transport: play all effective selection / pause / stop / prev / next ]

Document A
  [ Document transport ]
  Version v1
    [ Version transport ]
    ☐ track…
  Version v2
    …
  Legacy
    ☐ track…

Document B
  …
```

Selection / play rules:

- Checkboxes on **individual audio tracks**.
- If **any** tracks are checked **anywhere** in scope → that scope’s Play (version / document / global) plays **only the checked tracks** (in list order).
- If **no** tracks checked under a **version** and that version’s Play is used → play all tracks in that version.
- If **no** tracks checked under a **document** and that document’s Play is used → play **all** tracks in **all** versions + Legacy under that document (in order: Legacy first or versions asc then Legacy — **Legacy last**, versions ascending).
- Global Play with no checks → all documents, versions asc, Legacy last, chapters by name.
- Global / document / version Play with checks → **only checked tracks** (even if they span multiple versions/docs for global).

### Delete independence (locked)

- Delete **document** → removes source doc object(s) only; audios remain.
- Delete **audio** (track / version bulk if UI offers) → removes audio only; doc remains.

### API (existing — extend, not invent)

eVoice **already** has `/api/evoice/*` including:

`POST /api/evoice/projects/{ownerSafe}/{project}/generate`

Extend generate body with:

```json
{
  "files": ["a.pdf"],
  "mode": "standard" | "premium" | "super_premium",
  "contentPercent": 100 | 75 | 50 | 25 | 10 | 5
}
```

Deprecate/replace boolean `premium` with `mode` (accept legacy `premium: true` as `mode: "premium"` during transition).

Job snapshot stores `mode` + `contentPercent` for resume.

## Non-goals

- DeepSeek native PDF upload (does not exist).
- Spec 054 STT / audio upload.
- Music admin upload paths.
- ProductDashboard cards as primary eVoice UX.

## Acceptance

- [x] Radios Standard / Premium / Super Premium; default Standard
- [x] Super: PDF/images Vision@200dpi 1-page/req → format/% → TTS → `vN`; docx Super without Vision
- [x] Content % on all modes; 100% = no shorten instruction
- [x] Versioned MP3s; Legacy bucket for old names
- [x] Collapsible Upload / Docs+console / Playlists; 80vh + Show more
- [x] Playback selection rules as locked
- [x] Delete doc ≠ delete audio
- [x] Generate API `mode` + `contentPercent`
- [x] No view HDS; admin = top owner dropdown; crawl = upload modality; print = selected-doc prepared-speech action
- [x] Tests + FE build + commit/push

## Affected paths

- `specs/069-evoice-super-premium-hub/spec.md`
- `specs/044-evoice/spec.md` (amend UI / premium)
- `frontend/src/components/Evoice/**`
- `frontend/src/lib/evoice.ts`
- `backend/internal/evoice/**`
- `backend/internal/evoice/worker/linux_sync.py`
