# Milestone: Greek letter-by-letter builder — 2026-08-17

## Status: SHIPPED + Koine letter catalog (fixed alphabet #) + pick-from-catalog

Admin-only product to copy/visualize books **letter-image by letter-image** under S3 prefix `greek/`.
A **word is composed** of letter-images (not one image per word).

## Letter catalog (Koine) — 2026-08-17

Fixed alphabet numbering for Koine Greek Αα…Ωω:

| Slot | Meaning |
|------|---------|
| `n` (1–24) | Uppercase plain (Α=1 … Ω=24) |
| `n.1` | Lowercase plain |
| `n.2`…`n.9` | Accent / diacritic / special variants for that letter |

Examples: `nu-upper`=13, `nu-lower`=13.1; `sigma-final`=18.2; `omega-iota-sub`=24.9.

### Flow

1. **Letter catalog** button (Build + group workspace) → seed all slots → draw/edit SVG one-by-one (override same slug/key).
2. **Word card**: **Pick from catalog only** (no free-draw on word). Optional **Edit SVG** on a word letter slot overrides that word’s `letters/{i}.svg`.
3. Drawing pad displays at **128×256** (1:2, 4× of 32×64); export remains **32×64 SVG**.

### S3 layout (catalog = gallery prefix)

```
greek/{userSafe}/gallery/index.json
greek/{userSafe}/gallery/{glyphSlug}.svg
```

(No separate `catalog/` tree — UI “catalog” maps to `gallery/`.)

### APIs

| Method | Path |
|--------|------|
| GET | `/api/greek/catalog` (alias of gallery list) |
| POST | `/api/greek/catalog/seed` |
| PUT | `/api/greek/catalog/{slug}` (SVG override) |
| GET/DELETE | `/api/greek/catalog/{slug}` |
| GET/POST | `/api/greek/gallery` (legacy + POST create/override) |
| PUT/GET/DELETE | `/api/greek/gallery/{slug}` |

Seed writes empty placeholder SVGs; re-seed keeps already-drawn glyphs.

## Letter-image model

Each letter-image has:

1. **Image** — 32×64 SVG (from catalog pick or slot edit)
2. **Slug** — text field (usually catalog slug)
3. **Alphabet number** — fixed by Koine catalog (validation still allows 1…30 @ 0.1 for legacy)

Letter-images within a word sort by `alphabetNumber` ascending. Metadata in `word.json` as `letterImages[]`; SVG at `letters/{id}.svg`.

## Hotfix 2026-08-17 (create "romans" 502)

**Root cause of HTTP 502:** `POST /api/greek/groups` intentionally returns **502** when the catalog write succeeds but **S3 `PutObject` for `greek/…/group.json` fails** (typical: EC2 role missing `greek/*`).

**Modal crash:** `openApiErrorModal` first arg must be a string — fixed.

**Canvas stretch:** pad used `width: 100%` → skyscraper; fixed to display **128×256** (1:2).

## Routes (UI)

| Route | Role |
|-------|------|
| `/greek` | Hub (admin gate) |
| `/greek/build` | Group cards + **Letter catalog** |
| `/greek/build/{grupo}` | Pretty URL → workspace |
| `/greek/build/workspace?group=` | Group editor + catalog + pick |

## Persistence

### DynamoDB groups

- Table: `GREEK_TABLE` or `HOMESCOOL_TABLE` (default `eduardoos_catalog`)
- SK: `greek-group:u:{owner}|g:{slug}`

### S3

```
greek/{userSafe}/{groupSlug}/group.json
greek/{userSafe}/{groupSlug}/chapters/{ch}/chapter.json
greek/{userSafe}/{groupSlug}/chapters/{ch}/verses/{v}/verse.json
greek/{userSafe}/{groupSlug}/chapters/{ch}/verses/{v}/words/{w}/word.json
greek/{userSafe}/{groupSlug}/chapters/{ch}/verses/{v}/words/{w}/letters/{i}.svg
greek/{userSafe}/gallery/index.json          ← letter catalog index
greek/{userSafe}/gallery/{glyphSlug}.svg     ← catalog glyph (draw/override)
```

## Tests

- `go test ./internal/greek/...`
- `npm run test:greek`
