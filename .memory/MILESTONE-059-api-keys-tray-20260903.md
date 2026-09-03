# Milestone — API keys tray + list harden (2026-09-03)

Feature 059:
- Tray **API keys** → `/api-keys` (gated by `api` entitlement / admin)
- Profile keeps the same section (`#api-keys`)
- Store ops timeout 5s → JSON 503 instead of nginx hang/502 HTML

Spec: `specs/059-api-keys-tray/spec.md`
