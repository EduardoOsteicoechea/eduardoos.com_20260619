# Milestone — API subscription + keys + eReport v1 (2026-09-03)

Feature 055:

- Catalog service `api` ($3/mo)
- Profile API key create / list / revoke (secret once, SHA-256 at rest)
- Bearer API-key auth on `/api/v1/*` with 60/min rate limit
- eReport `GET|POST /api/v1/ereport/reports/{ownerSafe}/{reportId}` with `confirmOverwrite`
- Pre-replace snapshots + Historial modal (owner restore)

Spec: `specs/055-api-subscription-keys/spec.md`
