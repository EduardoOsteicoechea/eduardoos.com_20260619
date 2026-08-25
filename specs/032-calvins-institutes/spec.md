# Feature 032 — Calvin’s Institutes reader (S3-backed)

## Status

Active (2026-08-25). Updated: clean reader UI (no lead blurb; continuous Caput text).

## Problem

Public domain Institutes text is uploaded under S3 prefix `calvin-institutes/`. Eduardo OS needs a public page at `/latin/calvins-institutes` with a Services menu link that loads the index + sections via the backend (bucket stays private).

The S3 corpus mixes Allen English OCR (volume 1 + volume-2 digitization prelim) with Latin OCR. The public UI must show **Latin only** for now; English objects stay on S3 but must not appear in the public index.

Raw Latin OCR headings are noisy (running headers, OCR typos like `XIY`/`XXTIT`, duplicate Caput labels per page). The sidebar must show **one entry per chapter in canonical Liber/Caput order**, not every OCR page fragment.

### Corpus gap (why the sidebar starts at III.XI)

The uploaded Latin OCR in `calvin-institutes/` begins at **Liber III Caput XI**. Liber I, Liber II, and Liber III Capita I–X exist in this dump only as **Allen English** (volume 1), which stays hidden. The reader does **not** invent missing Latin Capita.

## Goals

| Surface | Path | Auth |
|---------|------|------|
| FE page | `/latin/calvins-institutes` | Public |
| Header | Services → **Calvin’s Institutes** | Always |
| BE index | `GET /api/latin/calvins-institutes` | Public — **Latin chapter outline** |
| BE section | `GET /api/latin/calvins-institutes/sections/{id}` | Public (raw S3 object; English keys still fetchable if known) |

- S3 source: `s3://{S3_BUCKET}/calvin-institutes/index.json` and `…/sections/NNNN.json` (full corpus unchanged)
- Optional env `CALVIN_INSTITUTES_S3_PREFIX` (default `calvin-institutes`)
- No Docker changes; upload via `backend/dynamodb_output/sync_to_s3.ps1`

### Latin-only index filter + chapter outline

`GET /api/latin/calvins-institutes` reads the full S3 `index.json`, then:

1. Keeps Latin rows only: `volume == 2`, excluding English `VOLUME N …` prelim sheets.
2. Builds a **chapter outline** from those rows (Liber III Caput XI–XXV, then Liber IV Argumentum + Capita I–XX).
3. Each outline entry’s `pages` lists all OCR section ids for that Caput in reading order.
4. S3 objects for excluded English / non-outline rows are **not** deleted.

### Reader UI

- Title only in the page head — **no** instructional lead paragraph.
- Selecting a Caput loads **all** `pages` and shows **one continuous** Latin body (joined with blank lines). **No** Previous/Next page controls.

## Non-goals

- DynamoDB import, full OCR cleanup of body text, CloudFront, public bucket ACLs.
- Deleting or rewriting English JSON on S3.
- Inventing Liber I–II or Liber III Capita I–X Latin when absent from the S3 Latin corpus.
- Re-showing Allen English in the public index (unless a future spec says otherwise).

## Acceptance

- [x] Menu link opens reader without login
- [x] Sidebar from index; section body loads from S3 via API
- [x] Missing object → 404 JSON; backend stays up
- [x] Public index lists Latin sections only (no Allen English headings)
- [x] Sidebar shows unique Capita in Liber/Caput order (no duplicate OCR page headings)
- [x] No instructional lead under the title
- [x] Caput view is continuous text (no Previous/Next page UI)
