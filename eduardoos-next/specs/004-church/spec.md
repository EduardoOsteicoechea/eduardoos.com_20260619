# Spec 004 — Church (Iglesia)

## Status

Implemented in `eduardoos-next` (2026-08-17).

## Purpose

Register and manage churches under S3 prefix `church/`, with role-based
membership (`church-admin` / `church-member`), searchable catalog, overview,
activities, activity reports (text + images), and a FullCalendar v6 activity
calendar (same library pattern as Homescool).

## UI routes

| Path | Audience | Behavior |
|------|----------|----------|
| `/church` | Signed-in | Grid of church cards + search |
| `/church/register` | Signed-in | Register a church → S3 + catalog |
| `/church/overview` | Member/admin | Linked church data; admin sees all; members see authorized; add activities; calendar at bottom |
| `/church/activity` | Member/admin | Per-user authorized activities; upload images + text report |
| `/church/{denomOrWebId}/{churchId}` | Signed-in | Detail with tabs (info, creencias, miembros, actividades, red) |

Pretty detail URLs rewrite via nginx to `/church/workspace` (static-safe shell).

## Roles

| Role | Scope | Access |
|------|-------|--------|
| Platform `admin` (`eduardooost@gmail.com` / `role=admin`) | All churches | Full read/write |
| `church-admin` | Membership on a church | Full church data + all activities + plan overview |
| `church-member` | Membership on a church | Only fields/activities they are authorized to see; may report on authorized activities |

Membership is **not** a JWT claim. JWT stays `admin` \| `user`. Church roles live in
Dynamo membership rows (+ mirrored on `church.json` members list).

## API (`/api/church/*`, JWT required)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/church` | List/search (`?q=`) |
| POST | `/api/church` | Register; caller becomes `church-admin` |
| GET | `/api/church/{denom}/{churchId}` | Detail (membership or platform admin) |
| PUT | `/api/church/{denom}/{churchId}` | Update (`church-admin` / platform admin) |
| GET | `/api/church/overview` | Caller's linked church overview |
| GET | `/api/church/activity` | Authorized activities for caller |
| POST | `/api/church/{denom}/{churchId}/activities` | Create activity (`church-admin`) |
| POST | `/api/church/{denom}/{churchId}/activities/{id}/report` | Text report (`multipart` optional images) |
| GET | `/api/church/{denom}/{churchId}/activities/{id}/images/{name}` | Fetch report image |
| POST | `/api/church/{denom}/{churchId}/members` | Add/update member (`church-admin`) |

## Persistence

### S3 (`eduardoos20260607`, env `S3_BUCKET`)

```
church/{denomOrWebId}/{churchId}/church.json
church/{denomOrWebId}/{churchId}/activities/{activityId}/activity.json
church/{denomOrWebId}/{churchId}/activities/{activityId}/reports/{reportId}.json
church/{denomOrWebId}/{churchId}/activities/{activityId}/images/{filename}
```

### DynamoDB (`eduardoos_catalog` when `CHURCH_BACKEND`/`DATABASE_BACKEND=dynamodb`)

| SK | Purpose |
|----|---------|
| `church:d:{denom}\|c:{churchId}` | Searchable church card |
| `church-member:u:{email}\|d:{denom}\|c:{churchId}` | User → church membership + role |

## Church document fields

- `name` — nombre de iglesia
- `pastors[]` — pastores
- `denominationId` / `network` / `localChurches[]` — red / denominación / iglesias locales
- `beliefsDocument` — documento de creencias
- `sectorActivities[]` — actividades por sector
- `members[]` — miembros (`email`, `name`, `role`, `authorizedActivityIds`)
- `activities` (S3 siblings) — actividades planificadas

## Calendar

Overview page embeds FullCalendar v6 (`@fullcalendar/react` + daygrid + timegrid),
themed with `--site-*` (same approach as Homescool `TasksCalendarBoard`).

## IAM

EC2 role must allow ListBucket prefixes `church/`, `church/*` and object CRUD on
`arn:aws:s3:::eduardoos20260607/church/*` (`deploy/aws/ec2-iam-s3-policy.json`).
Combined `ec2-iam-policy.json` already allows `eduardoos20260607/*`.

## Tests

- `go test ./internal/church/...`
- `npm run test:church`
