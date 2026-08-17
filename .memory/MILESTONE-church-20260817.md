# Milestone: Church registry + roles + calendar — 2026-08-17

## Status: SHIPPED (this commit)

JWT product under S3 prefix `church/` on bucket `eduardoos20260607`.

## Routes (UI)

| Route | Notes |
|-------|-------|
| `/church` | Searchable church card grid |
| `/church/register` | Register iglesia → S3 + Dynamo catalog |
| `/church/overview` | Linked churches; admin sees all; add activities; FullCalendar |
| `/church/activity` | Authorized activities + text/image reports |
| `/church/{denom}/{churchId}` | Detail tabs (nginx → workspace shell) |

Nav: Services → **Church**.

## Roles

- Platform `admin` / `eduardooost@gmail.com` — full access
- Membership `church-admin` — full church + create activities
- Membership `church-member` — authorized activities/fields only

Membership lives in Dynamo (not JWT claims). JWT stays `admin`|`user`.

## API

`/api/church/*` behind RequireJWT — list/search, register, detail, update,
overview, activity feed, members, create activity, report (+ images).

## Persistence

```
church/{denomOrWebId}/{churchId}/church.json
church/.../activities/{id}/activity.json
church/.../activities/{id}/reports/{reportId}.json
church/.../activities/{id}/images/{filename}
```

Dynamo (`eduardoos_catalog`): `church:d:…|c:…`, `church-member:u:…|d:…|c:…`.

## IAM

`deploy/aws/ec2-iam-s3-policy.json` includes ListBucket `church/`/`church/*` and
object CRUD on `arn:aws:s3:::eduardoos20260607/church/*`. Combined
`ec2-iam-policy.json` already allows `eduardoos20260607/*`. Re-apply EC2 role
policy if the instance still uses an older inline policy; wait ~1 min for
credential refresh.

## Spec

`eduardoos-next/specs/004-church/spec.md`

## Tests

- `go test ./internal/church/...`
- `npm run test:church`
