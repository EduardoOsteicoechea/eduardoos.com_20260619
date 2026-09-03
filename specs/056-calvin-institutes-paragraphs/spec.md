# Feature 056 — Calvin’s Institutes paragraph pack + Scrib chapter-copy modal

## Status

Ready to implement (2026-09-03).

## Problem

Feature 032 serves Institutes as **book → Caput (section)** with nested `paragraphs[]` in each Caput JSON. Scrib needs a first-class **book → chapter → paragraph** addressable corpus so an editor modal can pick a Caput and copy readable Latin units to the clipboard — without mutating the existing `calvin-institutes/` pack or the 032 reader.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Existing Capita files / 032 reader / old S3 prefix | **Untouched** |
| Deliverable | Parallel S3 pack + public API + Scrib “pick chapter → copy” modal |
| Paragraph unit | Same visual units as the 032 reader’s “break after period” display |
| Paragraph id | `{book}.{chapter}.{order}` e.g. `I.XI.3`; PRELIMINARY → `I.PRELIMINARY.N` |

## Hierarchy

```
book (I | II | III | IV)
  └── chapter (PRELIMINARY | Roman Caput: I, II, …)
        └── paragraph (1..N within that chapter)
```

- **Chapter id:** `{book}.{chapter}` — e.g. `I.XI`, `I.PRELIMINARY`, `III.X`.
- **Paragraph id:** `{book}.{chapter}.{order}` — e.g. `I.XI.3`.
- One Caput from the 032 corpus = one chapter in this pack (81 chapters).

## Paragraph derivation (`break-after-period-v1`)

Source of truth remains each 032 section JSON (`paragraphs[].text`, falling back to `points[].text` when paragraph text is empty — same preference as 032 `flattenSectionBody`).

For each Caput, produce ordered display segments exactly as the reader would show after `formatReadableParagraphBreaks`, then **split on `\n\n`**:

1. Prefer `paragraphs[].text` sorted by `order`; if empty, use sorted `points[].text` joined as separate inputs in point order.
2. Apply the same rules as FE `formatReadableParagraphBreaks`:
   - If text matches `^(\d+)\.\s+(.*)$`, emit `{digits}.` then the remainder with every `.\s+` turned into a segment boundary (period kept on the preceding segment).
   - Else split every `.\s+` the same way (period kept on the preceding segment).
3. Trim; drop empty segments.
4. Assign `order` 1..N **within the chapter** (global across that Caput’s source paragraphs).
5. `id` = `{book}.{section}.{order}` using the Caput’s `book` + `section` fields from the source index/section.

Do **not** invent Capita; do **not** re-OCR. Derivation is deterministic from the clean 032 pack.

## Parallel S3 pack (new prefix)

| Item | Value |
|------|--------|
| Bucket | Same as 032 (`S3_BUCKET` / Eduardo bucket) |
| Prefix | `calvin-institutes-paragraphs/` (env override `CALVIN_INSTITUTES_PARAGRAPHS_S3_PREFIX`) |
| Parent fingerprint | `sourceSha256` = 032 clean pack `162390b53e8173f25b7b94caa2dd5002d874c1071497a944a4232b793a0921f2` |
| Derivation tag | `derivation: "break-after-period-v1"` |
| Chapter count | `81` (readiness) |

### Layout

```
calvin-institutes-paragraphs/
  index.json
  chapters/{book}/{chapter}.json   # e.g. chapters/I/XI.json, chapters/I/PRELIMINARY.json
```

### `index.json`

```json
{
  "schemaVersion": 1,
  "sourceSha256": "162390b53e8173f25b7b94caa2dd5002d874c1071497a944a4232b793a0921f2",
  "sourceEdition": "…",
  "derivation": "break-after-period-v1",
  "chapterCount": 81,
  "paragraphCount": <sum>,
  "chapters": [
    {
      "id": "I.XI",
      "order": 12,
      "book": "I",
      "chapter": "XI",
      "heading": "CAPUT XI. — …",
      "sourceSectionId": "section-0012",
      "paragraphCount": 42,
      "url": "chapters/I/XI.json"
    }
  ]
}
```

### Chapter object `chapters/{book}/{chapter}.json`

```json
{
  "id": "I.XI",
  "order": 12,
  "book": "I",
  "chapter": "XI",
  "heading": "…",
  "sourceSectionId": "section-0012",
  "paragraphs": [
    { "id": "I.XI.1", "order": 1, "text": "…" }
  ]
}
```

Pack is **built offline** from a local copy of the 032 section files (or downloaded objects) and uploaded separately — same ops model as 032. The app never writes this prefix at runtime.

### Builder

- Go package under `backend/internal/latin/` (derivation + build helpers) with unit tests on fixtures.
- CLI: `go run ./backend/cmd/calvin-paragraphs-pack --in <calvin-institutes-dir> --out <out-dir>` writes `index.json` + `chapters/**`.
- Fixtures only in tests; do **not** vendor the full corpus in-repo.

## Public API (new routes; 032 routes unchanged)

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/latin/calvins-institutes/paragraphs` | Public — readiness-gated |
| GET | `/api/latin/calvins-institutes/paragraphs/chapters/{book}/{chapter}` | Public |

- Readiness: `sourceSha256` + `derivation` + `chapterCount === 81`.
- `{book}` ∈ `I|II|III|IV`; `{chapter}` = `PRELIMINARY` or Roman Caput token (same as source `section`).
- `Cache-Control: no-store`.
- Implement in **new** latin files (e.g. `paragraphs.go`); do **not** change Index/Section behavior for Capita.

## Scrib UI — pick chapter → copy

On the Scrib **sheet editor** (subscription-gated page):

1. Header Dynamic Menu gains an **Institutes** control (opens panel; distinct from Layers).
2. Panel title: Institutes / Capita.
3. **Placement (mandatory):**
   - **Desktop:** fixed top-right, width **20vw** (20% of screen), scrollable body.
   - **Tablet:** same as desktop (top-right, **20vw**).
   - **Mobile:** fixed top, width **100%**, height **20vh** (20% of screen height), scrollable body.
4. **Drill-down flow (mandatory):**
   1. Liber tabs (I–IV).
   2. **Chapter number** picker (compact chips / numbers for Capita in that Liber; PRELIMINARY shown as its own chip). Selecting a Caput loads that chapter JSON.
   3. **Paragraph number** picker appears **only after** a Caput is selected (chips for `1..N` / ids’ order).
   4. **Text** for the **selected paragraph only** appears **below** the paragraph picker (not the full chapter dump). Copy applies to that paragraph (optional: keep “Copy chapter” near the Caput once loaded).
5. Backdrop click / Cerrar closes the panel.
6. Non-goal: pasting into SVG layers — **clipboard only**.

### FE clients

- New helpers (prefer new module, e.g. `frontend/src/lib/calvinsInstitutesParagraphs.ts`) — do **not** break 032 `calvinsInstitutes.ts` contracts.
- Routes constants for the two new APIs.
- Modal component under `frontend/src/components/Scrib/` + CSS in `Scrib.css`.

## Non-goals

- Mutating `calvin-institutes/` objects, section ids, or 032 reader UX
- English Allen corpus
- Re-detecting Capita from OCR
- Typing/paste-into-layer tools in Scrib
- In-repo full corpus mirror

## Acceptance

- [x] Spec documents book → chapter → paragraph + id scheme + derivation
- [x] Builder + unit tests produce stable ids/`\n\n` segments from fixtures
- [x] New S3 prefix contract documented; old prefix never written by this feature
- [x] Public paragraph index + chapter APIs readiness-gated; 032 Capita tests still pass
- [x] Scrib editor: Institutes panel drill-down Liber → Caput number → paragraph number → one paragraph text + copy
- [x] Institutes panel placement: desktop/tablet top-right 20vw; mobile top 100% × 20vh
- [x] FE build passes when frontend changes ship
- [ ] Parallel pack uploaded to S3 `calvin-institutes-paragraphs/` (ops; outside this commit)

## Affected paths

- `specs/056-calvin-institutes-paragraphs/spec.md`
- `specs/024-scrib/spec.md` (pointer / acceptance note for Institutes modal)
- `backend/internal/latin/paragraphs*.go`, `backend/cmd/calvin-paragraphs-pack/**`
- `frontend/src/lib/calvinsInstitutesParagraphs.ts`, `frontend/src/config/routes.ts`
- `frontend/src/components/Scrib/**`

## Cross-links

- Corpus Capita: `specs/032-calvins-institutes/spec.md`
- Scrib editor: `specs/024-scrib/spec.md`
