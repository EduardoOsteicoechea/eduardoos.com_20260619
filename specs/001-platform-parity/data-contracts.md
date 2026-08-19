# Data contracts — preserve for cutover

These names and shapes come from the production Eduardo OS deployment.
**Next must read/write them as-is** unless a migration spec is approved.

## S3

| Bucket | Usage |
|--------|--------|
| `eduardoos20260607` | App media |
| `aps20250806` | APS Design Automation I/O |

### Prefixes on `eduardoos20260607`

| Prefix | Domain |
|--------|--------|
| `media/` | Gallery, profiles, audio, epams bodies, etc. |
| `media/instrumentalist/{user}/` | Instrumentalist `.instru` session bodies (see `specs/002-instrumentalist/`) |
| `homeschool/{teacher}/{student}/{folder}/` | Homescool teacher→student folder markers and objects (bucket-root; not under `media/`) |
| `ifcbim/{user}/{modelId}.ifc` | BIM IFC files |
| `greek/{userSafe}/…` | Greek builder books + **letter catalog** under `gallery/` (see below) |

### Greek builder (`greek/`)

```
greek/{userSafe}/{groupSlug}/group.json
greek/{userSafe}/{groupSlug}/chapters/{ch}/…/verses/{v}/…/words/{w}/word.json
greek/{userSafe}/{groupSlug}/…/words/{w}/letters/{i}.svg
greek/{userSafe}/gallery/index.json       # Koine letter catalog index
greek/{userSafe}/gallery/{glyphSlug}.svg  # catalog glyph (draw/override same key)
```

Alphabet # is fixed to the clean Greek alphabet (1=Α … 24=Ω; `n.1`=lower; `18.2`=ς final; **49 slots**). Re-seed replaces the listed set, drops obsolete accent slugs, and deletes undrawn orphan S3 keys only (drawn removed slugs stay unlisted on S3). UI “Letter catalog” uses the `gallery/` prefix (no separate `catalog/` tree). APIs: `/api/greek/catalog/*` (+ `/api/greek/gallery` aliases). `DELETE /api/greek/catalog/{slug}` clears the SVG to the empty placeholder and sets `drawn=false` while keeping seed slot metadata; `DELETE /api/greek/gallery/{slug}` still removes the glyph from the index.

## DynamoDB (us-east-1)

| Table | Notes |
|-------|--------|
| `eduardoos_catalog` | Generic KV (payments, catalog, **Homescool teacher→student links**) |
| `eduardoos_users` | Users (`user:` keys / store mapping) |
| `eduardoos_posts` | Posts |
| `eduardoos_refresh_tokens` | Refresh |
| `eduardoos_flight_logs` | Telemetry |
| `eduardoos_test_runs` | Tester |
| `eduardoos_playlists` | PK `userId`, SK `playlistId` |
| `eduardoos_epams` | Pamphlet metadata; body in S3. Fields include `series`, `seriesChapter` for tree grouping. |
| `eduardoos_edebats` | Debates |
| `eduardoos_payments` | PayPal intents |
| `eduardoos_entitlements` | Entitlements |
| `eduardoos_ifcbim` | PK `userId`, SK `modelId` |

Env flags production uses: `*_BACKEND=dynamodb`, `S3_BACKEND=aws`, `IFCBIM_TABLE=eduardoos_ifcbim`, etc.

### Homescool student links (DynamoDB via catalog)

When `HOMESCOOL_BACKEND` or `DATABASE_BACKEND` is `dynamodb`, links persist in
`HOMESCOOL_TABLE` (default `eduardoos_catalog`) with PK=`APP` and:

| SK | Role |
|----|------|
| `homescool-link:t:{teacher}\|s:{student}` | Primary pair |
| `homescool-by-student:s:{student}\|t:{teacher}` | Student-side list index |

`data` is JSON: `id`, `teacherEmail`, `studentEmail`, `studentSlug`, `s3Prefix`, `folders`, `createdAt`.
S3 folder bodies remain under `homeschool/...` (independent of the link row).
Re-register is idempotent (existing link → HTTP 200 + re-ensure `.keep` markers).

Same table also holds Homescool task templates, assigned tasks, and teacher catalogs:

| SK | Role |
|----|------|
| `homescool-tpl:t:{teacher}\|id:{id}` | Task template |
| `homescool-task:t:{teacher}\|s:{student}\|id:{id}` | Assigned task |
| `homescool-task-by-student:s:{student}\|t:{teacher}\|id:{id}` | Student task index |
| `homescool-cat:t:{teacher}\|k:{kind}\|id:{id}` | Catalog (`period` / `study_area` / `time`) |

Task scores are integers **1–5** (max score clamped to 5).

## Auth hashing

Production authenticator uses `sha256:` + hex digest for passwords.
Next auth **must** verify the same format for existing users.

## APS

Env: `APS_CLIENT_ID`, `APS_CLIENT_SECRET`, `APS_ACTIVITY_ID`.
Admin allowlist email: `eduardooost@gmail.com`.

## Pamphlet series tree (derived, no new table)

Tree is **computed** from `eduardoos_epams` list items (and document header on save). Shape:

```json
{
  "count": 2,
  "series": [
    {
      "name": "Cánticos espirituales",
      "chapters": [
        {
          "name": "1",
          "items": [
            {
              "epamId": "…",
              "title": "…",
              "fileName": "…",
              "series": "Cánticos espirituales",
              "seriesChapter": "1",
              "updatedAt": "…"
            }
          ]
        }
      ]
    }
  ]
}
```

- Unassigned pamphlets group under series name `"(sin serie)"` and chapter `"(sin capítulo)"`.
- `PUT /api/epams/{id}` with `document.header` (or explicit `series` / `seriesChapter`) updates Dynamo meta so the tree stays in sync.
- Route: `GET /api/epams/series-tree` (JWT). Register **before** `/api/epams/{id}`.
