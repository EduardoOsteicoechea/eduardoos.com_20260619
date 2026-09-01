# Feature 032 — Calvin’s Institutes reader (Latin 1559, S3-backed)

## Status

Active (2026-08-26). Updated: **clean Barth/Niesel Latin pack** (readable Capita; no ABBYY OCR body).

## Problem

Public domain Institutes text is uploaded under S3 prefix `calvin-institutes/`. Eduardo OS needs a public page at `/dashboard/latin/calvins-institutes` (legacy `/latin/calvins-institutes` redirects; spec 051) with a Services menu link that loads the index + sections via the backend (bucket stays private).

The corpus is **Latin-only 1559 Institutes** from the clean pack (Barth/Niesel Latin via calvin.reformation.nl). **Do not** re-detect Capita from OCR. **Do not** invent a new chapter map. English Allen assets must never appear on this Latin route.

### Prior gap (resolved)

Live site previously showed ABBYY OCR garbage (e.g. Liber I Caput XI “Dej tribuere utfibilem…”). The clean Caput XI is `sections/0012.json` with heading  
`CAPUT XI. — Deo tribuere visibilem formam nefas esse, ac generaliter deficere a vero Deo quicunque idola sibi erigunt.`

## Data source

| Item | Value |
|------|--------|
| S3 prefix | `s3://eduardoos20260607/calvin-institutes/` |
| Index | `{prefix}/index.json` |
| Sections | `{prefix}/sections/0001.json` … `0081.json` (relative `url` in index) |
| Readiness | `sectionCount === 81` **AND** `sourceSha256 === "162390b53e8173f25b7b94caa2dd5002d874c1071497a944a4232b793a0921f2"` |
| Optional | `sourceEdition` mentions Barth/Niesel |

Clean pack is maintained **outside this repo** and uploaded to S3 separately. The app only proxies and readiness-gates that prefix — it does **not** vendor `website_assets` in-tree.

### Division (do not change ids / order / urls)

**81 sections = 1 PRELIMINARY + 80 Capita**

| Liber | Contents | orders |
|-------|----------|--------|
| I | PRELIMINARY (Praefatio) + Capita I–XVIII | 1–19 |
| II | Capita I–XVII | 20–36 |
| III | Capita I–XXV (must include III.I–X) | 37–61 |
| IV | Capita I–XX | 62–81 |

Canonical Capita counts: I:18, II:17, III:25, IV:20.

### Content contract / parse rules

- Hierarchy: book → section (Caput) → heading → `paragraphs[]` → `points[]`
- Fields: `book` (`I|II|III|IV`), `section` (Roman or `PRELIMINARY`), `heading`, `paragraphs[{order,text,points[{order,text}]}]`
- **Prefer** `paragraphs[].text` in `paragraphs[].order` for the reader body
- `points[]` are optional subdivisions; if shown, use `points[].text` in order
- Ignore top-level `"text": null`
- Parse assets **as-is**; do not re-OCR / re-split Capita from ABBYY XML
- Do **not** mix English Institutes into this Latin route

## Goals

| Surface | Path | Auth |
|---------|------|------|
| FE page | `/dashboard/latin/calvins-institutes` (hub `?view=dashboard\|read`) | Public |
| Header | Services → **Calvin’s Institutes** | Always |
| BE index | `GET /api/latin/calvins-institutes` | Public — readiness-gated |
| BE section | `GET /api/latin/calvins-institutes/sections/{id}` | Public |

### Reader UI (flush workspace)

- No on-page brand `h1` “Calvin’s Institutes”; Caput `heading` is the reader title.
- Flush left Capita sidebar (Homescool pattern); toggled from Header Dynamic Menu.
- Only the main panel scrolls; text panel borderless; full width when sidebar closed.
- Sidebar grouped by Liber I–IV, sorted by `order`; PRELIMINARY under Liber I (label from heading).
- Caput label = `heading` (already short clean titles).
- Load section JSON on demand from index `url` / `id`; index fetch uncached.
- Body paragraphs: insert a blank line after each sentence period (`. ` → `\n\n`) for readability — including the Praefatio / PRELIMINARY. Numbered Capita paragraphs (`N. …`) also break after the leading marker. Display with `white-space: pre-wrap`.

## Non-goals

- Re-detecting Capita from OCR / inventing a chapter map
- Allen English on this route
- Changing section ids, order, or url scheme
- Treating sticky OCR on the live site as authoritative when clean sha matches

## Acceptance

- [x] Sidebar shows Liber I–IV with all Capita + PRELIMINARY
- [x] Opening **I.1, I.XI, II.1, III.1, III.10, III.11, IV.1** shows readable Latin (not utfibilem / glyph junk) when S3 has the clean pack
- [x] API/FE readiness uses `sourceSha256` `162390b53e8173f25b7b94caa2dd5002d874c1071497a944a4232b793a0921f2`
- [x] No in-repo `backend/dynamodb_output` mirror of website assets
- [x] Flush left sidebar; header toggle; borderless text panel
