# Milestone: Greek letter-by-letter builder — 2026-08-17

## Status: SHIPPED (this commit)

Admin-only product to copy/visualize books glyph-by-glyph under S3 prefix `greek/`.

## Routes (UI)

| Route | Role |
|-------|------|
| `/greek` | Hub (admin gate) |
| `/greek/build` | Group cards (books) + create |
| `/greek/build/{grupo}` | Pretty URL → nginx rewrite → `workspace` shell |
| `/greek/build/workspace?group=` | Static-safe group editor |

Nav: Services → **Greek**. Client `isAdminOnlyPagePath` + JWT admin on APIs.

## API (JWT + platform admin)

| Method | Path |
|--------|------|
| GET/POST | `/api/greek/groups` |
| GET/PUT/DELETE | `/api/greek/groups/{slug}` |
| POST | `/api/greek/groups/{g}/chapters` |
| POST | `…/chapters/{ch}/verses` |
| POST/PUT | `…/verses/{v}/words` |
| POST/GET/DELETE | `…/words/{w}/letters` (+ `…/letters/{i}`) |

Admin = `role === admin` or bootstrap `eduardooost@gmail.com`.

## Persistence

### Catalog (DynamoDB when `GREEK_BACKEND`/`DATABASE_BACKEND=dynamodb`)

- Table: `GREEK_TABLE` or `HOMESCOOL_TABLE` (default `eduardoos_catalog`)
- SK: `greek-group:u:{owner}|g:{slug}`

### S3 (bucket `eduardoos20260607`, env `S3_BUCKET`)

```
greek/{userSafe}/{groupSlug}/group.json
greek/{userSafe}/{groupSlug}/chapters/{ch}/chapter.json
greek/{userSafe}/{groupSlug}/chapters/{ch}/verses/{v}/verse.json
greek/{userSafe}/{groupSlug}/chapters/{ch}/verses/{v}/words/{w}/word.json
greek/{userSafe}/{groupSlug}/chapters/{ch}/verses/{v}/words/{w}/letters/{i}.svg
```

`word.json`: `translation1`, `translation2`, `ordinalChapter` (1–1000), `ordinalBook` (1–10000), `letterCount`.
Letters are **32×64** SVG (canvas stroke export).

## IAM

Update EC2 role inline policy from `deploy/aws/ec2-iam-s3-policy.json`:

- `ListBucket` prefixes: `greek/`, `greek/*` (also `homeschool/`, `homeschool/*`)
- `GetObject`/`PutObject`/`DeleteObject` on `arn:aws:s3:::eduardoos20260607/greek/*`

## Tests

- `go test ./internal/greek/...`
- `npm run test:greek`
