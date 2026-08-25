# Feature 032 — Calvin’s Institutes reader (Latin 1559, S3-backed)

## Status

Active (2026-08-25). Updated: sanitized Latin-only 1559 corpus (81 sections).

## Problem

Public domain Institutes text is uploaded under S3 prefix `calvin-institutes/`. Eduardo OS needs a public page at `/latin/calvins-institutes` with a Services menu link that loads the index + sections via the backend (bucket stays private).

The corpus is the **Latin-only 1559 Institutes** extracted from `institutiochrist1559calv_abbyy.xml` (NOT Allen English XMLs). English Allen assets must never appear on this Latin route.

### Prior gap (resolved by new assets)

The previous OCR upload effectively started the public sidebar at **Liber III Caput XI**. The sanitized index now includes Liber I–II and Liber III Capita I–X.

## Data source (after S3 sync)

| Item | Value |
|------|--------|
| S3 prefix | `s3://eduardoos20260607/calvin-institutes/` |
| Index | `{prefix}/index.json` |
| Sections | `{prefix}/sections/0001.json` … `0081.json` (relative `url` in index) |
| Readiness | `index.sectionCount === 81` **AND** `index.sourceSha256 === "ecc221dfb9428e34de11e392df0711d96cf0333e5fbb5baa1a4a5e774309ccc8"` |

If sha/count mismatch: **do not** serve a public outline against stale/wrong cache — return an error so the UI waits for S3 sync. Index responses must use `Cache-Control: no-store` (and the FE must fetch with `cache: "no-store"`).

### Content contract

- Hierarchy: book → section (Caput) → heading → `paragraphs[]` → `points[]`
- Structure: **1 PRELIMINARY + 80 Capita = 81 sections**
  - Liber I: PRELIMINARY + Capita I–XVIII (18 chapters)
  - Liber II: Capita I–XVII (17)
  - Liber III: Capita I–XXV (25) — **must** include III.I–X
  - Liber IV: Capita I–XX (20)
- Index/section fields: `book` (`"I"|"II"|"III"|"IV"`), `section` (Roman `"I"`…`"XXV"` or `"PRELIMINARY"`), `heading`, `paragraphs[{order,text,points[{order,text}]}]`
- Do **not** invent missing Capita; if a Caput is absent from the index, treat as data error.
- Do **not** mix English Institutes assets into this Latin route.

## Goals

| Surface | Path | Auth |
|---------|------|------|
| FE page | `/latin/calvins-institutes` | Public |
| Header | Services → **Calvin’s Institutes** | Always |
| BE index | `GET /api/latin/calvins-institutes` | Public — Latin 1559 outline (readiness-gated) |
| BE section | `GET /api/latin/calvins-institutes/sections/{id}` | Public — section JSON as stored |

### Reader UI (flush workspace)

- **No** on-page brand `h1` “Calvin’s Institutes” (document `<title>` may still say it). Caput `heading` is the reader title.
- Narrow padding: flush to the left rail like Homescool.
- Capita **sidebar fixed** in the left column (does not scroll away with the Caput text).
- **Only the main panel scrolls** (`overflow-y: auto`); the page/`main` shell does not.
- Sidebar **toggles** via Header Dynamic Menu (`#header-dynamic-menu-host`, Homescool portal pattern).
- When sidebar is closed, the text panel is **full width** of `main`.
- Text panel: **no** outer border/box; continuous Caput body from `paragraphs` / `points` (not a single flat `text` blob, not joined OCR pages).
- Sidebar grouped by **Liber I–IV**, then Caput order from `index.sections` sorted by `order`.
- Show **PRELIMINARY** once under Liber I (front matter), labeled clearly; then Capita.
- Load section JSON on demand from the selected index entry (`id` / relative `url`); keep index fetch uncached.

## Non-goals

- Inventing missing Latin Capita.
- Showing Allen English on this route.
- Client-side OCR cleanup / rewriting Latin text.
- Collapsing multi-page OCR sheets into Capita (obsolete; each Caput is one section file).

## Acceptance

- [x] Latin route lists all **80 Capita + preliminary** (81 entries), grouped Liber I–IV.
- [x] Opening **I.1, II.1, III.1, III.10, III.11, IV.1** works (section JSON loads; body shows paragraphs/points).
- [x] Liber I, Liber II, and Liber III Caput I–X appear (site must not start at III.XI).
- [x] No English Allen text on the Latin route.
- [x] Index API refuses (error) when `sourceSha256` / `sectionCount` do not match the readiness contract.
- [x] After deploy, hard-refresh / bypass CDN cache on `index.json` (`no-store`).
- [x] Flush left sidebar; toggled from header dynamic menu; text panel borderless; expands when sidebar hidden.
