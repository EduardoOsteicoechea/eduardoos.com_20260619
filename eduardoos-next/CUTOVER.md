# Cutover plan — Eduardo OS Next → production

This document is the **only** authorized path to replace the live site.
Until every gate below is green, **do not** change parent `deploy.yml`, nginx root, or EC2 `APP_DIR` to this tree.

## Goals

- Zero data loss: keep S3 buckets and DynamoDB tables as-is.
- Zero surprise downtime: staging rehearsal first, then DNS/nginx switch.
- Rollback: keep the previous release artifacts/process ready for one release cycle.

## Preconditions

- [ ] Spec `001-platform-parity` converge: all must-have routes/APIs implemented.
- [ ] Auth works against existing `eduardoos_users` (same password hash scheme).
- [ ] Epams / playlists / ifcbim / payments read-write smoke tests on **staging** with prod-like IAM (or read-only prod replica policy).
- [ ] Frontend build succeeds on target EC2 size (Node heap).
- [ ] Backend `/health` green; nginx `/api/` proxies to new binary.
- [ ] APS admin + hub explorer verified with real credentials.
- [ ] Rollback drill documented (how to point nginx back to old `frontend/dist` + old binary).

## Data contracts (must not change without a migration)

Documented in `specs/001-platform-parity/data-contracts.md`.

## Switch steps (when approved)

1. Tag `eduardoos-next` release.
2. Deploy next build to staging host (or second path on EC2 that is not public).
3. Run cutover checklist.
4. Point nginx document root + API upstream to next artifacts **or** replace `APP_DIR` contents after backup.
5. Smoke: `/`, `/auth/login`, `/documents/pamphlet`, `/aps-admin`, one authenticated API.
6. Monitor 24h; keep old tree as `eduardoos-prev` backup.

## Explicit non-goals for day-one cutover

- Rewriting DynamoDB table names
- Moving S3 objects to new prefixes without dual-read
- Changing JWT secret (invalidates sessions) unless coordinated
