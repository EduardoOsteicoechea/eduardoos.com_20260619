# Milestone: Church groups + líderes + church cards — 2026-08-17

## Status: SHIPPED (this commit)

Extends Church register under `eduardoos-next` without changing Greek.

## What shipped

1. **`/church/groups`** (platform admin) — CRUD redes/denominaciones.
   - Dynamo `church-group:g:{id}` + S3 `church/groups/{id}/group.json`
   - Register **RED / DENOMINACIÓN** is a dropdown of this catalog (persist group id)

2. **Líderes** (replaces Pastores) — dynamic +/− rows; multi-select fixed roles:
   elder/bishop/pastor, evangelist, teacher/preacher/prophet, ministry leader,
   apostolic partner/church planter/missionary

3. **Iglesias = cards** on `/church/register`:
   nombre, fecha apertura, dirección, liderazgo (dropdown of líderes catalog)

4. **Miembros = cards** with name parts, address, phone, email; **iglesia**
   dropdown of church cards already on the form. Membership grant on save —
   matching eduardoos.com account sees dashboard/overview **without**
   `church-management` subscription.

5. Register gate unchanged: approved + `church-management` (or platform admin).

## IAM

`church/groups/` lives under existing `church/*` — **no new IAM paths**.

## Spec

`eduardoos-next/specs/004-church/spec.md`

## Tests

- `go test ./internal/church/...`
- `npm run test:church`
