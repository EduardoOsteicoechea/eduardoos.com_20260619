# Milestone: Homescool student subscription bypass — 2026-08-17

## Status: SHIPPED (`114b112`)

Linked Homescool students (any teacher→student row) use Homescool **without**
paying. Teachers still need an active `homescool` entitlement. Admins keep full
bypass (`05a6224` + this work).

## Rules

| Actor | Hub + `/homescool/learning` | Teacher UI/APIs |
|-------|-----------------------------|-----------------|
| Linked student | Allowed (no sub) | Denied unless they also have a sub |
| Teacher (no link as student) | Needs sub | Needs sub |
| Admin | Always | Always |

## Implementation

| Layer | Change |
|-------|--------|
| `GET /api/subscriptions/access/homescool` | Also allows if `HomescoolStudentChecker` finds a student link; returns `is_homescool_student` + `has_entitlement` |
| Homescool teacher routes | `requireTeacherAccess` → 403 without sub/admin when `Entitlements` wired |
| Learning routes | JWT + link authz only (no sub) |
| `ServiceGate` | Default allows student bypass; teacher pages use `requireSubscription` |

## Tests

- `go test ./internal/payments/...` — linked student / stranger / teacher / admin
- `go test ./internal/homescool/...` — teacher 403, learning 200 for linked student, admin OK
- `npm run test:service-access` — FE gate matrix
