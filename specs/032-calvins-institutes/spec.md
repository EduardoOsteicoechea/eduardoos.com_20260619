# Feature 032 — Calvin’s Institutes reader (S3-backed)

## Status

Active (2026-08-25). Updated: Latin-only **chapter outline** (ordered Capita).

## Problem

Public domain Institutes text is uploaded under S3 prefix `calvin-institutes/`. Eduardo OS needs a public page at `/latin/calvins-institutes` with a Services menu link that loads the index + sections via the backend (bucket stays private).

The S3 corpus mixes Allen English OCR (volume 1 + volume-2 digitization prelim) with Latin OCR. The public UI must show **Latin only** for now; English objects stay on S3 but must not appear in the public index.

Raw Latin OCR headings are noisy (running headers, OCR typos like `XIY`/`XXTIT`, duplicate Caput labels per page). The sidebar must show **one entry per chapter in canonical Liber/Caput order**, not every OCR page fragment.

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
2. Builds a **chapter outline** from those rows:
   - Tracks Liber III / Liber IV from `LIBER …` headings (incl. OCR `LIBER IY`).
   - Maps `CAPUT …` headings to Roman numerals with OCR normalization (`Y→V`, `XXTIT→XXIII`, etc.).
   - Ignores non-sequential Caput jumps within a Liber (e.g. Caput I → Caput X mid-stream = running-header noise; page stays on current Caput).
   - Collapses all pages of the same `(Liber, Caput)` into **one** outline entry.
   - Sorts outline: Liber III Capita ascending, then Liber IV (Argumentum, then Capita I…).
   - Heading labels: `Liber III · Caput XI`, `Liber IV · Caput I`, `Liber IV · Argumentum`.
3. Each outline entry’s `id` / `url` / `order` point at the **first** page of that chapter; optional `pages` lists all section ids in reading order for in-chapter paging.
4. S3 objects for excluded English / non-outline rows are **not** deleted.

## Non-goals

- DynamoDB import, full OCR cleanup of body text, CloudFront, public bucket ACLs.
- Deleting or rewriting English JSON on S3.
- Blocking direct section fetches by numeric id (hide via index only).
- Inventing Liber III Capita I–X if absent from the Latin S3 corpus.

## Acceptance

- [x] Menu link opens reader without login
- [x] Sidebar from index; section body loads from S3 via API
- [x] Missing object → 404 JSON; backend stays up
- [x] Public index lists Latin sections only (no Allen English headings)
- [x] FE copy states Latin OCR (not Allen English)
- [x] Sidebar shows unique Capita in Liber/Caput order (no duplicate OCR page headings)
- [x] Multi-page chapters can step through pages without leaving the chapter
