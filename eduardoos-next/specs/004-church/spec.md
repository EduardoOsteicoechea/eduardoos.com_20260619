# Spec 004 — Church (Iglesia)

## Status

Implemented in `eduardoos-next` (2026-08-17). Extended with groups catalog,
líderes, member cards, and multi-church register cards.

## Purpose

Register and manage churches under S3 prefix `church/`, with role-based
membership (`church-admin` / `church-member`), searchable catalog, overview,
activities, activity reports (text + images), and a FullCalendar v6 activity
calendar (same library pattern as Homescool).

## UI routes

| Path | Audience | Behavior |
|------|----------|----------|
| `/church` | Signed-in | Grid of church cards + search |
| `/church/groups` | Platform admin | CRUD redes / denominaciones catalog |
| `/church/register` | Approved + `church-management` sub (or platform admin) | Multi-church register under a catalog group |
| `/church/overview` | Member/admin | Linked church data; address/open date/leadership; add activities; calendar |
| `/church/activity` | Member/admin | Per-user authorized activities; upload images + text report |
| `/church/{denomOrWebId}/{churchId}` | Signed-in | Detail with tabs (info, creencias, miembros, actividades, red) |

Pretty detail URLs rewrite via nginx to `/church/workspace` (static-safe shell).
Reserved path segments: `register`, `overview`, `activity`, `workspace`, `groups`.

## Register UX

1. **Red / denominación** — dropdown from admin `/church/groups` catalog (persist group id).
2. **Líderes** — dynamic list (+/−); each row name + multi-select roles:
   - elder/bishop/pastor
   - evangelist
   - teacher/preacher/prophet
   - ministry leader
   - apostolic partner/church planter/missionary
3. **Iglesias** — one card per church: nombre, fecha apertura, dirección,
   liderazgo (dropdown of líderes already entered).
4. **Miembros** — cards with primer/segundo nombre, apellidos, dirección,
   teléfono, correo; **iglesia** dropdown of registered church cards.
5. Gate unchanged: approved + `church-management` (or platform admin).

Members receive Dynamo `church-member` rows on save. Matching eduardoos.com
account email can open that church’s dashboard/overview **without** a
church-management subscription (membership grant).

## Roles

| Role | Scope | Access |
|------|-------|--------|
| Platform `admin` (`eduardooost@gmail.com` / `role=admin`) | All churches + groups catalog | Full read/write |
| `church-admin` | Membership on a church | Full church data + all activities + plan overview |
| `church-member` | Membership on a church | Only fields/activities they are authorized to see; may report on authorized activities |

Membership is **not** a JWT claim. JWT stays `admin` \| `user`. Church roles live in
Dynamo membership rows (+ mirrored on `church.json` members list).

## API (`/api/church/*`, JWT required)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/church` | List/search (`?q=`) |
| POST | `/api/church` | Register one or more church cards; gated; requires catalog `denominationId` |
| GET | `/api/church/groups` | List denomination groups |
| POST | `/api/church/groups` | Create group (platform admin) → Dynamo + S3 |
| PUT | `/api/church/groups/{id}` | Rename group (platform admin) |
| DELETE | `/api/church/groups/{id}` | Delete group (platform admin) |
| GET | `/api/church/leader-roles` | Fixed líder role options |
| GET | `/api/church/authorization` | Caller authz status + canRegister |
| POST | `/api/church/authorization/request` | Request platform approval (pending queue) |
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
church/groups/{groupId}/group.json
church/{denomOrWebId}/{churchId}/church.json
church/{denomOrWebId}/{churchId}/activities/{activityId}/activity.json
church/{denomOrWebId}/{churchId}/activities/{activityId}/reports/{reportId}.json
church/{denomOrWebId}/{churchId}/activities/{activityId}/images/{filename}
```

### DynamoDB (`eduardoos_catalog` when `CHURCH_BACKEND`/`DATABASE_BACKEND=dynamodb`)

| SK | Purpose |
|----|---------|
| `church-group:g:{groupId}` | Denomination / network catalog |
| `church:d:{denom}\|c:{churchId}` | Searchable church card |
| `church-member:u:{email}\|d:{denom}\|c:{churchId}` | User → church membership + role |
| `church-auth:u:{email}` | Platform approval to register (pay after approve) |

## Church document fields

- `name`, `openedAt`, `address`
- `leaders[]` — `{ firstName, lastName, phone?, email?, name?, roles[] }`
  (legacy `{ name, roles[] }` and `pastors[]` still read; display = `nombre apellido`)
- `orgLeaders[]` — snapshot of register-time líderes catalog
- `denominationId` / `network` / `localChurches[]`
- `beliefsDocument`, `sectorActivities[]`
- `members[]` — email, name parts, address, phone, role, `churchId` assignment, `authorizedActivityIds`

## Register gate

1. User requests authorization (`POST /api/church/authorization/request`).
2. Admin reviews pending list on `/admin/users` (bottom section).
3. On approve: SMTP HTML email → subscribe to `church-management` ($1/mo), then register.
4. Platform admin always bypasses approval + entitlement.

## Calendar

Overview page embeds FullCalendar v6 (`@fullcalendar/react` + daygrid + timegrid),
themed with `--site-*` (same approach as Homescool `TasksCalendarBoard`).

## IAM

EC2 role must allow ListBucket prefixes `church/`, `church/*` and object CRUD on
`arn:aws:s3:::eduardoos20260607/church/*` (`deploy/aws/ec2-iam-s3-policy.json`).
Combined `ec2-iam-policy.json` already allows `eduardoos20260607/*`.

**Groups path** `church/groups/` is under the existing `church/*` object prefix —
no IAM policy change required beyond the existing Church note.

## Tests

- `go test ./internal/church/...`
- `npm run test:church`
