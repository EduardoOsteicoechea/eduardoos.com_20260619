# Milestone: Greek letter-by-letter builder — 2026-08-17

## Status: SHIPPED + clean Greek letter catalog (Αα…Ωω + ς)

**Nav (2026-08-18):** Greek is **hidden** from Header Services for now.
Routes `/greek*` and `/api/greek*` remain; admin can still open them by URL.

Admin-only product to copy/visualize books **letter-image by letter-image** under S3 prefix `greek/`.
A **word is composed** of letter-images (not one image per word).

## Letter catalog (clean alphabet) — 2026-08-17

Fixed alphabet numbering for the **standard Greek alphabet** only (no polytonic stacks):

| Slot | Meaning |
|------|---------|
| `n` (1–24) | Uppercase plain (Α=1 … Ω=24) |
| `n.1` | Lowercase plain |
| `18.2` | Sigma final (ς) — only extra standard form |

**49 slots total** = 24 upper + 24 lower + final ς.

Examples: `nu-upper`=13, `nu-lower`=13.1; `sigma-final`=18.2; `omega-lower`=24.1.

Accent / breathing / iota-subscript variants were removed from the seed.

### Flow

1. **Letter catalog** button (Build + group workspace) → seed all slots → draw/edit SVG one-by-one (override same slug/key).
2. **Word card**: **Pick from catalog only** (no free-draw on word). Optional **Edit SVG** on a word letter slot overrides that word’s `letters/{i}.svg`.
3. Drawing pad displays at **128×256** (1:2, 4× of 32×64); export remains **32×64 SVG**.
4. **Delete letter** (word row trash): confirm → `DELETE …/letters/{index}` removes the slot from `word.json` `letterImages` and deletes the **word-local** `letters/{i}.svg` only. Shared `gallery/{slug}.svg` is never wiped.
5. **Symbol fallback**: if the word-local SVG is missing/empty (no strokes), the thumbnail shows the Unicode Greek character from the catalog (slug / alphabet # / `label`).

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
| GET | `/api/greek/catalog/{slug}` |
| DELETE | `/api/greek/catalog/{slug}` — **clear drawing** (EmptyLetterSVG + `drawn=false`; keeps seed slot) |
| GET/POST | `/api/greek/gallery` (legacy + POST create/override) |
| PUT/GET/DELETE | `/api/greek/gallery/{slug}` (gallery DELETE still removes the glyph from the index) |
| DELETE | `/api/greek/groups/…/words/{w}/letters/{index}` — remove letter from word (word-local SVG + letterImages; catalog untouched) |

Seed writes empty placeholder SVGs. **Re-seed / refresh**:
- Replaces the listed slot set with the clean 49-slot alphabet
- Keeps already-drawn SVGs for slots that remain
- Stops listing obsolete (accent) slugs
- Deletes S3 keys only for removed **undrawn** orphans; drawn SVGs for removed slugs are left on S3 (unlisted)

Response fields: `seeded`, `created`, `updated`, `keptDrawn`, `pruned`, `orphanDeleted`.

### Catalog row UI

Drawn slots show the SVG preview **beside** the letter label, with a **trash** control (`currentColor` icon) that `confirm`s then clears the drawing via `DELETE /api/greek/catalog/{slug}`.

### Word letter row UI

Each letter slot under WORDS → LETTERS has **Edit SVG** plus a **trash** control that confirms then removes that letter from the word. Undrawn / empty-SVG slots show the catalog Unicode symbol in the thumbnail.

## Letter-image model

Each letter-image has:

1. **Image** — 32×64 SVG (from catalog pick or slot edit)
2. **Slug** — text field (usually catalog slug)
3. **Alphabet number** — fixed by clean catalog (validation still allows 1…30 @ 0.1 for legacy)

Letter-images within a word sort by `alphabetNumber` ascending. Metadata in `word.json` as `letterImages[]`; SVG at `letters/{id}.svg`.
Tree/API letter refs include `label` (Unicode) and `drawn` (stroke detection).

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
