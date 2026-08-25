# Feature 032 — Calvin’s Institutes reader (S3-backed)

## Status

Active (2026-08-25). Updated: flush workspace chrome (Homescool pattern).

## Problem

Public domain Institutes text is uploaded under S3 prefix `calvin-institutes/`. Eduardo OS needs a public page at `/latin/calvins-institutes` with a Services menu link that loads the index + sections via the backend (bucket stays private).

The S3 corpus mixes Allen English OCR (volume 1 + volume-2 digitization prelim) with Latin OCR. The public UI must show **Latin only** for now; English objects stay on S3 but must not appear in the public index.

Raw Latin OCR headings are noisy. The sidebar must show **one entry per chapter in canonical Liber/Caput order**.

### Corpus gap (why the sidebar starts at III.XI)

The uploaded Latin OCR begins at **Liber III Caput XI**. Liber I–II and Liber III Capita I–X exist only as Allen English (hidden).

## Goals

| Surface | Path | Auth |
|---------|------|------|
| FE page | `/latin/calvins-institutes` | Public |
| Header | Services → **Calvin’s Institutes** | Always |
| BE index | `GET /api/latin/calvins-institutes` | Public — Latin chapter outline |
| BE section | `GET /api/latin/calvins-institutes/sections/{id}` | Public |

### Reader UI (flush workspace)

- **No** on-page `h1` “Calvin’s Institutes” (document `<title>` may still say it).
- Narrow padding: flush to the left rail like Homescool (`padding-left: 0` on shell; content uses `--page-inline-pad` / ~0.85rem gutter).
- Capita **sidebar docked left** (border-right only; not a floating card).
- Sidebar **toggles** via Header Dynamic Menu button (same portal pattern as Homescool Folders).
- When sidebar is closed, the text panel is **full width** of `main`.
- Text panel: **no** outer border/box; continuous Caput body (joined OCR pages).

## Non-goals

- Inventing missing Latin Capita; re-showing Allen English; OCR cleanup.

## Acceptance

- [x] Latin-only ordered Capita outline + continuous Caput text
- [x] No instructional lead under a page title
- [x] No on-page Calvin’s Institutes heading
- [x] Flush left sidebar; toggled from header dynamic menu
- [x] Text panel borderless; expands when sidebar hidden
