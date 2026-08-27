# Spec 004 — Church (Iglesia)

## Status

**Temporarily offline (2026-08-27):** UI menu link hidden; Astro `/church*` redirects home;
backend does **not** mount `/api/church/*` unless `CHURCH_ENABLED=1`.
Code and S3/Dynamo data remain in the repo for re-enable.

Implemented in `eduardoos-next` (2026-08-17). Extended with groups catalog,
independent leaders catalog, structured beliefs, member cards, and multi-church
register cards.

## Purpose

Register and manage churches under S3 prefix `church/`, with role-based
membership (`church-admin` / `church-member`), searchable catalog, overview,
activities, activity reports (text + images), and a FullCalendar v6 activity
calendar (same library pattern as Homescool).

## Temporary disable (re-enable checklist)

1. Set `CHURCH_ENABLED=1` in `.env` / deploy env (default is off).
2. Set `CHURCH_FEATURE_ENABLED = true` in `frontend/src/lib/churchFeature.ts` (or read the same env at build time).
3. Confirm Services menu shows Church again (gated by that FE flag).
4. Confirm Subscribe catalog shows `church-management` again (same FE flag).
5. Redeploy backend + frontend.

## Acceptance (temporary hide)

- [ ] Services menu has no Church link.
- [ ] Visiting `/church` (and subpaths) redirects to `/`.
- [ ] Backend without `CHURCH_ENABLED=1` does not serve `/api/church/*` (404).
- [ ] Subscribe UI does not offer `church-management`.
- [ ] Church packages/data remain in the repo; flip flags restores the product.

## UI routes

| Path | Audience | Behavior |
|------|----------|----------|
| `/church` | Signed-in | Grid of church cards + search |
| `/church/groups` | Platform admin | CRUD redes / denominaciones catalog |
| `/church/leaders` | Register-gate users + platform admin | Independent líderes catalog; networkIds + optional churchIds |
| `/church/register` | Approved + `church-management` sub (or platform admin) | Multi-church register; liderazgo from leaders catalog; creencias one-by-one |
| `/church/overview` | Member/admin | Linked church data; address/open date/leadership/beliefs; add activities; calendar |
| `/church/activity` | Member/admin | Per-user authorized activities; upload images + text report |
| `/church/{denomOrWebId}/{churchId}` | Signed-in | Detail with tabs (info, creencias, miembros, actividades, red) |

Pretty detail URLs rewrite via nginx to `/church/workspace` (static-safe shell).
Reserved path segments: `register`, `overview`, `activity`, `workspace`, `groups`, `leaders`.

## Out of scope for this temporary hide

- Deleting church packages, Dynamo tables, or S3 `church/` data.
- Disabling admin `church-authorization-requests` APIs (platform ops may still need them).
