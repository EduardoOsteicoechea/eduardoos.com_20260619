# Milestone: Admin full service access (ServiceGate + entitlements) — 2026-08-17

## Status: SHIPPED on branch tip (see commit)

Platform admins must never be blocked by subscription `ServiceGate` or
`GET /api/subscriptions/access/{serviceID}`.

## Rules

- **Bootstrap email** `eduardooost@gmail.com` (`auth.AdminEmail` / `APS_ADMIN_EMAIL`) always admin.
- **Stored / JWT role** `admin` also always admin (`auth.IsAdmin` / frontend `isPlatformAdmin`).
- Prefer role-based checks; keep email allowlist for compatibility.

## Changes

| Layer | Behavior |
|-------|----------|
| JWT | `role` claim via `IssueJWTWithRole` at login / verify-OTP |
| Profile | `GET /api/auth/profile` returns `role` |
| Payments | `Users` store wired; `CheckAccess` / entitlements use `IsAdmin(email, role)` |
| Frontend | `isPlatformAdmin`, `ServiceGate`, pamphlet gate, `hasServiceAccess` |

## Tests

- `go test ./internal/payments/...` — admin bypass for homescool + debate (email + role)
- `npm run test:service-access` — FE mirror of homescool + debate bypass

## Note

Avoid conflicting edits to Homescool student-links store (separate agent work).
