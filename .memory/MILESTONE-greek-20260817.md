# Milestone: Greek letter-by-letter builder — 2026-08-17

## Status: SHIPPED + hotfix (create-group 502 / ServerErrorModal)

Admin-only product to copy/visualize books glyph-by-glyph under S3 prefix `greek/`.

## Hotfix 2026-08-17 (create "romans" 502)

**Root cause of HTTP 502:** `POST /api/greek/groups` intentionally returns **502** when the catalog write succeeds but **S3 `PutObject` for `greek/…/group.json` fails** (typical: EC2 role missing `greek/*`). Routes were already registered in `main.go` + chi; nginx `location /api/` proxies all `/api/greek/*`.

**Modal crash:** `greek.ts` called `openApiErrorModal({ title, status, message, … })` but the helper expects a **string** first arg → `details.trim is not a function`. Fixed call sites + hardened `coerceErrorDetails` so non-string details never crash.

**Ops:** If the copyable modal shows `AccessDenied` / `greek/*`, re-apply IAM from `deploy/aws/ec2-iam-s3-policy.json` (or the combined `ec2-iam-policy.json` which already allows `eduardoos20260607/*`). Wait ~1 min for instance credentials to refresh.

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
- `npm run test:server-error-modal`
