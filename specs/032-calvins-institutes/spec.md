# Feature 032 — Calvin’s Institutes reader (S3-backed)

## Status

Active (2026-08-25). Updated: Latin-only public index.

## Problem

Public domain Institutes text is uploaded under S3 prefix `calvin-institutes/`. Eduardo OS needs a public page at `/latin/calvins-institutes` with a Services menu link that loads the index + sections via the backend (bucket stays private).

The S3 corpus mixes Allen English OCR (volume 1 + volume-2 digitization prelim) with Latin OCR. The public UI must show **Latin only** for now; English objects stay on S3 but must not appear in the public index.

## Goals

| Surface | Path | Auth |
|---------|------|------|
| FE page | `/latin/calvins-institutes` | Public |
| Header | Services → **Calvin’s Institutes** | Always |
| BE index | `GET /api/latin/calvins-institutes` | Public — **Latin sections only** |
| BE section | `GET /api/latin/calvins-institutes/sections/{id}` | Public (raw S3 object; English keys still fetchable if known) |

- S3 source: `s3://{S3_BUCKET}/calvin-institutes/index.json` and `…/sections/NNNN.json` (full corpus unchanged)
- Optional env `CALVIN_INSTITUTES_S3_PREFIX` (default `calvin-institutes`)
- No Docker changes; upload via `backend/dynamodb_output/sync_to_s3.ps1`

### Latin-only index filter

`GET /api/latin/calvins-institutes` reads the full S3 `index.json`, then returns a filtered JSON document:

- **Include** sections with `volume == 2` whose heading is **not** an English volume prelim (`VOLUME 2 …`).
- **Exclude** all `volume == 1` (Allen English) and the English digitization sheet at the start of volume 2.
- Response keeps `schemaVersion` / `sourceSha256` from S3; `sectionCount` and `sections` reflect the filtered list only.
- S3 objects for excluded sections are **not** deleted or rewritten.

## Non-goals

- DynamoDB import, OCR cleanup, CloudFront, public bucket ACLs.
- Deleting or rewriting English JSON on S3.
- Blocking direct section fetches by numeric id (hide via index only).

## Acceptance

- [x] Menu link opens reader without login
- [x] Sidebar from index; section body loads from S3 via API
- [x] Missing object → 404 JSON; backend stays up
- [x] Public index lists Latin sections only (no Allen English headings)
- [x] FE copy states Latin OCR (not Allen English)
