# Feature 069 — eVoice Super Premium + collapsible hub (no dashboard)

## Status

**Mostly locked** (2026-09-04) — one open item: **HDS / header icons** (Q8). Do not implement until Q8 is answered.

## Problem

1. Local extract (pypdf / Tesseract) often yields poor speech scripts for hard PDFs/scans; Premium only reformats that bad text.
2. Users want optional **length control** (summarize to a % of original word count) before TTS.
3. The eVoice hub still uses the ProductDashboard card/views model; the product needs a single-page, **collapsible-section** workspace instead.

## Locked decisions

| # | Decision |
|---|----------|
| 1 | Mode UX: mutually exclusive radios **`Standard` \| `Premium` \| `Super Premium`**. Default = **Standard** (Super Premium off by default). |
| 2 | **Content %** applies to **all** generate modes. |
| 3 | **Super Premium** only for **PDF, images, and `.docx`**. Not for plain `.txt` (those use Standard/Premium only). |
| 4 | Vision: **1 page per API request** (reliability over batching). |
| 5 | Page render DPI for Vision: **200**. |
| 6–7 | Playback selection rules — see Playlist below. |
| 9 | All three sections **open** by default; workspace column max **80vh**, `overflow-y: auto`, with a **Show more** control that expands height to fit the playlist / content. |
| 10 | **Delete doc does not delete audio** (and vice versa). Docs and audios are independent. |
| 11 | Pre-version MP3s appear under a **Legacy** bucket (not auto-renamed to `v1`). |
| 12 | Extend existing generate job API (see API). |

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

### UI — three collapsible sections (no dashboard cards)

Primary eVoice page is **not** ProductDashboard card grid. One workspace with independent collapsible sections:

1. **Upload controls** — upload, paste, project chrome, mode radios, content % (also mirrored or primary in docs action bar — prefer **docs action bar** for % + mode + generate; Upload keeps file/paste only unless we co-locate — **lock: mode radios + content % live in section 2 action bar**; Upload section = files/paste/project only).
2. **Uploaded documents** — list; below list after selection: **Delete**, **Generate MP3** (always next version). Console **toggleable to the right**.
3. **Playlists** — nested structure below.

Viewport: sections area ≈ **80vh**, `overflow-y: auto`; **Show more** expands to full playlist height.

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

## Open — Q8 HDS (needs your call)

**What “HDS” means:** the **Header Dynamic Section** — the icon buttons in the site header (today: Dashboard, Admin, Upload, Docs, Audios, Playlist, Print, Crawl) that switch `?view=`.

Because the main workspace becomes **one page with three sections**, the old view icons (Dashboard / Upload / Docs / Audios / Playlist) are redundant.

**Choose one:**

- **(A)** Remove those view icons; **no HDS** on eVoice except maybe nothing.
- **(B)** Keep **Admin** (admin only), **Crawl**, **Print** as HDS icons that scroll/expand a dedicated subsection or small panel.
- **(C)** Keep Admin only in HDS; put Crawl/Print inside Upload or Docs as secondary actions.

## Non-goals

- DeepSeek native PDF upload (does not exist).
- Spec 054 STT / audio upload.
- Music admin upload paths.
- ProductDashboard cards as primary eVoice UX.

## Acceptance (after Q8)

- [ ] Radios Standard / Premium / Super Premium; default Standard
- [ ] Super: PDF/images Vision@200dpi 1-page/req → format/% → TTS → `vN`; docx Super without Vision
- [ ] Content % on all modes; 100% = no shorten instruction
- [ ] Versioned MP3s; Legacy bucket for old names
- [ ] Collapsible Upload / Docs+console / Playlists; 80vh + Show more
- [ ] Playback selection rules as locked
- [ ] Delete doc ≠ delete audio
- [ ] Generate API `mode` + `contentPercent`
- [ ] Q8 HDS choice implemented
- [ ] Tests + FE build + commit/push

## Affected paths

- `specs/069-evoice-super-premium-hub/spec.md`
- `specs/044-evoice/spec.md` (amend UI / premium)
- `frontend/src/components/Evoice/**`
- `frontend/src/lib/evoice.ts`
- `backend/internal/evoice/**`
- `backend/internal/evoice/worker/linux_sync.py`
