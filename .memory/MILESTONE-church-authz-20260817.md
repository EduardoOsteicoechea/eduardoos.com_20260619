# Milestone: Church register authorization + church-management — 2026-08-17

## Status: SHIPPED (this commit)

Registering a church requires **platform admin approval first**, then an active
**`church-management`** subscription ($1/mo). Platform admin always bypasses.

## Flow

1. Signed-in user clicks **Request authorization** on `/church` or `/church/register`.
2. Request appears at the bottom of `/admin/users` (pending list).
3. Admin **Approve** or **Reject**.
4. On **Approve only**: HTML email (atelier style via SMTP) — user may register
   **after** paying Church Management; link to `/payments/subscription`.
5. `/church/register` allowed only if `approved` + active entitlement (or admin).
6. Browse `/church` grid stays JWT-only (any signed-in user).

## Catalog

| ID | Label | Monthly |
|----|-------|---------|
| `church-management` | Church Management | $1 |

## API

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/church/authorization` | status + canRegister |
| POST | `/api/church/authorization/request` | create/renew pending |
| POST | `/api/church` | gated register |
| GET | `/api/admin/church-authorization-requests` | default pending |
| POST | `/api/admin/church-authorization-requests/{email}/approve` | + email |
| POST | `/api/admin/church-authorization-requests/{email}/reject` | |

## Dynamo

`SK: church-auth:u:{email}` on `eduardoos_catalog` (PK=APP).

## Tests

- `go test ./internal/church/... ./internal/payments/...`
- `npm run test:church` / `npm run test:service-access`
