# Milestone: Admin bulk user registration — 2026-08-17

## Status: SHIPPED

Platform admin (`/admin/users`) can paste or upload a JSON list of users;
each row is created like public register (unverified + OTP email via SMTP).

## API

`POST /api/admin/users/bulk-register` (JWT + admin gate)

Body: JSON array **or** `{ "users": [ ... ] }`

Row fields (aliases):

- `name` / `nombre` (optional, stored on user)
- `email` / `correo`
- `password` / `contrasena` / `contraseña` (min 8; never logged)

Response: `{ created, failed, results: [{ index, email, name, status, reason }] }`

Per-row failures (duplicate, weak password, invalid email, mail failure) do not
abort the batch. Max 100 rows.

## Implementation

- `auth.RegisterUnverifiedAccount` shared by public register + admin bulk
- `admin.UseAuth(authHandler)` wires SMTP on the process auth handler
- UI section on `AdminUsersPage` documents sample JSON + results list

## Tests

`go test ./internal/admin/... ./internal/auth/...`
