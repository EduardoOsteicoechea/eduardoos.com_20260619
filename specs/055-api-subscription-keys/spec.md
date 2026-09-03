# Feature 055 — API subscription, API keys, eReport external update

## Status

**Spec draft — awaiting confirmation of remaining defaults** (see § Decisions still open). Do not implement until those are locked.

## Problem

Registered users need a billable **API** product so external apps can call Eduardo OS with a long-lived API key (not a browser JWT). The first linked product is **eReport**: an external client must be able to **fully replace** a report payload, with mandatory overwrite acknowledgement, automatic pre-replace snapshots (history), and a UI history modal in the editor.

## Goals

### 0. Catalog — service `api`

| Field | Value |
|-------|--------|
| Catalog id | `api` |
| Label | API |
| Price | **$3 / month** (yearly = 10× monthly, same quote rules as other services) |
| Description | Create API keys and call product APIs from external apps. |

- Appears on `/payments/subscription` card grid like other billable services.
- Admin Users entitlements editor includes `api`.
- Platform **admin still must create an API key** to call key-authenticated routes; once authenticated by key, **admin bypasses per-product entitlements** (access to all linked product APIs). Non-admin key holders need **active `api` entitlement** plus the **target product entitlement** (e.g. `ereport` for eReport routes).

### 1. Entitlement model for key-authenticated calls

For every `/api/v1/...` request authenticated by an API key:

1. Resolve key → owning user email (+ admin flag).
2. Require active **`api`** entitlement **unless** the owner is platform admin.
3. Require active entitlement for the **requested product** (e.g. `ereport`) **unless** platform admin.
4. **Key effective scope** = `api` subscription (gate) **∪** that user’s other active subscriptions (and admin = all products). There is **no** per-key product allowlist in v1; scope follows the user’s entitlements at request time.
5. **eReport write target:** only reports **owned** by the key’s user. Shared / invite collaborators: **no API write** in v1 (slot reserved for later “API access for invited”; currently none).

### 2. API keys (profile UI + management API)

**UI:** `/auth/profile` — new section (plain CSS, product-dashboard chrome) for users with active `api` entitlement **or** admin:

- Create key: required **label** (non-empty string).
- Show **plaintext secret once** at creation (copy UX); never again.
- List: label, key **prefix** (e.g. first 8 chars + `…`), createdAt, lastUsedAt (optional), revoke.
- Revoke: immediate invalidate.

**Storage (industry standard):**

- Persist only **SHA-256 hash** of the secret (or equivalent one-way hash), plus prefix, label, owner email, createdAt, revokedAt.
- Secret format: opaque high-entropy token with a stable prefix for recognition, e.g. `eos_live_<random>` (exact prefix locked in implementation notes).
- JWT session APIs manage keys; external callers never use JWT for `/api/v1/*`.

**Management routes (JWT, subject = key owner; admin may only manage own keys unless later expanded):**

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/apikeys` | List metadata (no secrets) |
| POST | `/api/apikeys` | `{ label }` → `{ key, …metadata }` secret once |
| DELETE | `/api/apikeys/{id}` | Revoke |

Require `api` entitlement or admin to manage keys.

### 3. External auth (industry standard)

- Header: **`Authorization: Bearer <api_key>`** (same pattern external HTTP clients already use for POSTs).
- Do **not** require `X-Api-Key` as the primary scheme (optional alias out of scope).
- Gateway / backend: `/api/v1/*` is **not** JWT-authenticated; middleware validates Bearer as API key, attaches owner email + admin to request context, applies rate limits, then product handlers run entitlement checks.
- Correlation: still inject/propagate `X-Correlation-ID`.

### 4. Rate limit (v1 default)

Per API key (by key id):

- **60 requests / minute** sliding or fixed window.
- HTTP **429** with `Retry-After` when exceeded.
- No separate rate-limit dashboard in v1.

### 5. eReport — first linked product API

**Path (full replace):**

```
POST /api/v1/ereport/reports/{ownerSafe}/{reportId}
Authorization: Bearer <api_key>
Content-Type: application/json
```

**Body:**

```json
{
  "confirmOverwrite": true,
  "tema": "optional string",
  "payload": { /* full Issue Tracker .ereport JSON — required */ }
}
```

**Rules:**

- `confirmOverwrite` **must be** JSON `true`. If missing/false → **400** with a clear error (forces the client to acknowledge full override of the latest web/cloud version).
- `payload` required; full replace of `report.ereport` (same shape as JWT `PUT` body payload).
- `ownerSafe` must match the key owner’s safe id (admin calling for another owner: **not** allowed in v1 unless admin is the owner — admin bypass is product entitlement only, not cross-user ownership). **Clarification locked:** API may only mutate reports where `meta.ownerEmail` equals the key owner email (platform admin key still only owns admin’s own reports for write; admin does not get cross-user API overwrite in v1).
- Before writing the new payload: if a current `report.ereport` exists, **persist a snapshot** under history (see §6), then replace.
- Update meta (`updatedAt`, optional `tema`, reportNumber/date from payload when present) and touch library card like JWT `PUT`.
- Response: `{ meta, payload, snapshotId? }` on success.

**Optional read (proposed default — confirm):**

```
GET /api/v1/ereport/reports/{ownerSafe}/{reportId}
```

Same auth + ownership rules; returns `{ meta, payload }` for clients that need current state before POST.

**Out of scope for this eReport API surface in v1:** create/delete/share, org-scoped reports (`/orgs/...`), invite links, shared-collaborator writes.

### 6. Snapshot history (API replaces only)

- Trigger: **only** successful API `POST … confirmOverwrite` that replaces payload (not every JWT editor save).
- Storage (S3), under the report prefix, e.g.:

```
ereport/{ownerSafe}/reports/{reportId}/history/{snapshotId}.json
ereport/{ownerSafe}/reports/{reportId}/history-index.json
```

- Snapshot object: `{ id, createdAt, source: "api", keyPrefix?, tema, payload }` (payload = **previous** version).
- Retention default: keep **last 50** snapshots per report; prune oldest on insert.
- JWT editor (and owner) can **list** and **restore** via authenticated (JWT) routes:

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/ereport/reports/{ownerSafe}/{reportId}/history` | owner/admin; list index |
| GET | `/api/ereport/reports/{ownerSafe}/{reportId}/history/{snapshotId}` | owner/admin; one snapshot |
| POST | `/api/ereport/reports/{ownerSafe}/{reportId}/history/{snapshotId}/restore` | owner/admin; write snapshot payload back as current (may itself snapshot current first with `source: "restore"`) |

### 7. eReport editor UI — History

- Header dynamic menu (same pattern as Hub / Tema / Guardar / Compartir): add **Historial** button.
- Opens a **history modal**: list snapshots (date, source, key prefix if any); view summary; **Restore** with confirm.
- Visible to report **owner** (and admin viewing as owner). Shared viewers: hide or read-only list without restore (default: **owner only**).

### 8. Frontend / catalog wiring

- Subscription catalog + ServiceGate / tray visibility for `api` where applicable (API is not a tray “app”; it is a subscription + profile capability).
- Profile section components + CSS.
- Docs string or short copy in profile: how to call eReport POST with Bearer + `confirmOverwrite`.

## Non-goals

- Per-key product scopes / allowlists (v1 follows user entitlements).
- API write for shared/invited users.
- Cross-user overwrite via admin API key.
- Org-report API paths.
- Real-time sync / websockets.
- Public unauthenticated report URLs.
- Rate-limit analytics UI.
- OAuth2 client-credentials (Bearer API key only).

## Acceptance

- [ ] Catalog `api` at $3/mo; subscribe + admin grant work.
- [ ] Profile: create (label, secret once), list, revoke; secrets hashed at rest.
- [ ] `Authorization: Bearer` on `/api/v1/*`; JWT key CRUD on `/api/apikeys`.
- [ ] Non-admin needs `api` + `ereport` for eReport v1 POST; admin needs key only.
- [ ] POST full replace requires `confirmOverwrite: true`; rejects otherwise.
- [ ] Each API replace snapshots previous payload; history modal list + restore for owner.
- [ ] Rate limit 60/min/key → 429.
- [ ] Owned reports only; tests (Go) + FE build; commit + push.

## Affected paths (expected)

- `specs/055-api-subscription-keys/spec.md`
- `backend/internal/payments/catalog.go` (+ admin/FE catalog mirrors)
- `backend/internal/apikeys/**` (store, hash, middleware, handlers)
- `backend/internal/ereport/**` (v1 POST, history, restore)
- `backend/cmd/server/main.go` (mount + auth wiring)
- Gateway / public-route bypass list for `/api/v1/*` (API-key middleware, not open anon)
- `frontend/src/pages/auth/profile.astro` + profile API-keys UI/CSS
- `frontend/src/components/Ereport/**` (Historial modal + header menu)
- `frontend/src/config/routes.ts`, subscription UI labels

## Decisions still open (confirm before code)

Reply yes/adjust:

1. **GET** `/api/v1/ereport/reports/{ownerSafe}/{reportId}` in v1? **Proposed: yes.**
2. **History retention:** last **50** snapshots per report? **Proposed: 50.**
3. **Admin API write:** only admin’s **own** reports (no cross-user)? **Proposed: own only** (as written above).
4. **Org reports:** out of v1 API? **Proposed: yes, out.**
5. **Overwrite flag name:** `confirmOverwrite: true`? **Proposed: keep.**
6. **Rate limit:** **60 / minute / key**? **Proposed: keep.**
