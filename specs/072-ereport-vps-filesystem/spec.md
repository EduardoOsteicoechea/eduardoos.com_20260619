# Feature 072 — eReport VPS filesystem (owner directory by email + username)

## Status

**Spec locked** (2026-09-07) — user approved `1A 2B 3B 4A 5B 6A 7B 8A 9A 10B`.

**Amendment A (2026-09-07) — owner directory keyed by email + username.** The original lock derived the owner directory from an immutable Mongo `userId`. That made eReport depend on a platform identity migration that has not happened: this repo still authenticates with DynamoDB-backed users and a JWT whose only identity claim is the **email**. There is no `userId` and no `username` field on the user record.

Amendment A therefore replaces decision **2** — the owner directory is now derived from the authenticated **email plus a human-readable username segment** — and splits delivery into two passes so the storage layer can ship without the identity migration:

| Pass | Scope | State |
   20||------|-------|-------|
| **1 — storage** | eReport durable bytes move to the VPS filesystem; S3 removed from eReport; owner directory `{username}/{safeEmail}`; existing JWT auth kept as-is | **this pass** |
| **2 — identity & invites** | Platform identity migration, HttpOnly cookie sessions, rotating refresh tokens, invite OTP, image extraction to files, vendored export libs | deferred |

Everything in this file that Amendment A does not restate stays locked.

This spec is the **source of truth for new eReport runtime**. It supersedes S3, flat reports, capability-only invites, CDN export scripts, and any document-store-for-report-blobs design.

Related shipped UX (still valid unless this file contradicts it): tracker/HDS (025 §4, 049), org hub (046), additive API POST (070), validation criteria (068), viewUrl (062), connector skill (063/064).

    30|## Problem

Shipped eReport stores JSON under S3 keys, authorizes some routes from a client-supplied `ownerSafe`, and keeps JWTs in localStorage. The target site stores **report bytes only on the VPS** and authorizes from the **session**, never from a path segment the client chose.

## Locked decisions (verbatim map)

| # | Choice | Meaning |
|---|--------|---------|
| 1A | Filesystem objects | Report JSON, metadata, history, invites, extracted images live under `/var/www/eduardoos.com/media/ereport/` |
| 2 ~~A~~ | **Superseded by Amendment A** | Owner directory is `{username}/{safeEmail}`, not a Mongo `userId` — see §2 |
    40|| 2B | Extract new images | New images become validated files; do **not** write new base64; do **not** batch-migrate old base64 |
| 3B | Magic link + email OTP | Invitee needs **no** Eduardo OS account; must prove the invited email via OTP |
| 4A | Full tracker | Invite collaborators use the same Issue Tracker iframe as owners |
| 5B | Org reports only | New runtime has **no** flat `…/reports/{id}` library, shares, or JWT history for pre-org reports |
| 6A | Subscribe to create | Active `ereport` entitlement (or platform admin) required to **create org / create report / import**. Open, edit, invite, delete stay available to the owner without a current subscription |
| 7B | No admin cross-org | Platform admin does **not** read or write another user's eReport directories |
| 8A | Identity store = platform only | The platform user store (DynamoDB today, Mongo in pass 2) holds users, roles, sessions, OTPs, entitlements, API keys, and authorization **checks**. It never holds eReport payloads, meta, history, invites, or images |
| 9A | No S3 migrate | Do not copy `s3://…/ereport/`. Greenfield filesystem. S3 stays out of **new** eReport runtime code and config |
| 10B | Vendor export libs | Bundle/vendor `html2canvas` and `jsPDF` in the frontend build; no jsDelivr (or other) CDN for those in the tracker |
    50|
## Goals

### 1. Storage root (mandatory)

All eReport durable files:

```
/var/www/eduardoos.com/media/ereport/
```

    60|Environment name: `EREPORT_MEDIA_ROOT` (default that path on the VPS). The API process must be the only writer. Directory mode `0750`, files `0640`.

**Forbidden**

- Any database (document, key-value, or relational) for report payloads, org/report metadata, history snapshots, invite documents, or images.
- Locating or authorizing files from a **client-supplied** email, username, path, or report id **alone**.
- Public Nginx alias of `/media/` or `/var/www/eduardoos.com/media`.
- S3 SDK, `S3_BUCKET`, IAM `ereport/*`, or signed URLs in new eReport code/config.

### 2. Owner directory = email (authoritative) + username (label)

    70|The Go API derives the owner directory **only** from the **authenticated session email**. A client-supplied email, username, or `ownerSafe` never selects a directory.

Canonical owner directory:

```
/var/www/eduardoos.com/media/ereport/<username>/<safe-email>/
```

| Segment | Source | Role |
|---------|--------|------|
    80|| `<safe-email>` | session email, lowercased, `@` → `_at_`, `/` → `_` | **authoritative** — identifies the owner |
| `<username>` | the user's `Name` slugified; the email local part when `Name` is empty | **label only** — human-readable, never used to resolve or authorize |

Because `Name` is editable, the username segment is **not stable**. The two rules that make this safe:

1. **Lookup is by email.** Resolving an owner directory searches for an existing `*/<safe-email>` directory and reuses it, whatever username segment it already carries.
2. **The username segment is written once**, when the owner directory is first created. Renaming a display name therefore **must not** move, rename, or orphan any directory.

Canonical report directory:

```
    90|/var/www/eduardoos.com/media/ereport/<username>/<safe-email>/orgs/<org-id>/reports/<report-id>/
```

Files under an owner directory:

```
orgs.json                                              # owner's org list
orgs/<org-id>/meta.json
orgs/<org-id>/library.json
orgs/<org-id>/reports/<report-id>/meta.json            # id, orgId, tema, dates, display ownerEmail/username, updatedAt
   100|orgs/<org-id>/reports/<report-id>/report.ereport       # tracker payload
orgs/<org-id>/reports/<report-id>/history-index.json
orgs/<org-id>/reports/<report-id>/history/<snapshot-id>.json
orgs/<org-id>/reports/<report-id>/images/<image-id>.<ext>
```

Invite documents are **not** under a client-supplied path; the id is server-generated:

```
/var/www/eduardoos.com/media/ereport/invites/<invite-id>.json
```

   110|The raw magic secret is stored **hashed**. Lookup is by server-side hash of the presented token, never by email in the path. Invite JSON holds the owner email, `orgId`, optional `reportId`, `invitedEmail` (display + OTP target), `scope` (`org` | `report`), `expiresAt`, `canEdit`.

#### Object keys vs filesystem paths

eReport addresses objects by **logical key** (`ereport/<safe-email>/orgs/…`). The storage layer owns the physical layout and is the only component that knows about the username segment. This keeps one identity in the domain code (the email) while the disk stays browsable by a human.

Path safety is enforced in the storage layer, not by callers: every key is rejected unless it stays under the root after cleaning (no `..`, no absolute paths, no drive/UNC prefixes, no empty or `.`-only segments).

### 3. Authorization (Go only)

File access is **never** Nginx-static. Browser and API clients call Go. Private bytes (JSON, images, history) are served with **authenticated** Go handlers; large files may use Nginx **internal** `X-Accel-Redirect` to:
   120|
```
alias /var/www/eduardoos.com/media/;
internal;
```

A request is allowed only if one of:

1. **Owner** — the session email resolves to the owner directory holding the resource.
2. **Invite collaborator** — valid invite session for `invitedEmail`, invite not expired, scope covers the org or report.
   130|3. **Explicit approved permission** — only if later spec'd as a filesystem ACL file under the owner tree. **Not** platform-admin cross-org (decision 7B).

`orgId` / `reportId` in the URL are **insufficient**. The server loads the resource from the **owner it already established** via session or invite record, then checks the ids match. A guessed id under another user's tree must 404/403 without leaking existence beyond generic not-allowed.

Platform admin (`role=admin`): same as a normal user for **eReport files** — only their own owner directory. Admin still bypasses **subscription** checks for **their own** create/import; they do **not** gain other users' reports.

### 4. Authentication

**Pass 1 (this pass)** keeps the shipped scheme unchanged: JWT bearer issued by the platform auth handler, email claim, `RequireJWT` on owner routes. eReport gains no new auth surface.

**Pass 2** replaces it site-wide: short-lived access JWT in a Secure HttpOnly cookie, opaque rotating refresh token hashed at rest, CSRF token, and the invitee OTP flow (3B) with a scoped invite cookie. Invite durations remain 046: report invite **1 hour**; org invite chosen in the modal, min 1h, max 30 days.

   140|### 5. Images (2B)

- Tracker uploads and any **new** image bytes are written under `…/reports/<report-id>/images/` with a server-generated id, extension from **magic bytes** (allowlist: JPEG, PNG, WebP, GIF — **not** SVG/HTML).
- Max size per image and per report: set in implementation constants; reject oversize.
- Payload stores `{ id, mime, name }` (and API URL), **not** new `dataUrl` base64.
- Serving: Go authz then `X-Accel-Redirect` (or small files streamed by Go).
- **No** migration of S3 objects (9A). Imported `.ereport` files that still carry `dataUrl` keep those blobs; **new** images follow the file rule.

Images land in pass 2.

   150|### 6. Product surface (org only, 5B)

Hub and APIs are org-first (046). **Do not** ship in the new runtime:

- Flat `ereport/<email>/reports/…`
- `library.json` / `shared-index.json` email trees
- JWT `GET/PUT /api/ereport/reports/{ownerSafe}/{reportId}`, `/shares`, flat `/history`
- v1 `legacyReports` and `GET/POST /api/v1/ereport/reports/{ownerSafe}/{reportId}`

Pretty URLs must not be used as filesystem keys. Preferred editor URL remains `/ereport/workspace?org=&report=`. If `user=` remains for display, Go **ignores** it for path construction.

   160|Invite UI: **full tracker**, not the raw JSON textarea. Export: vendor html2canvas + jsPDF into `frontend/`; remove `cdn.jsdelivr.net` script tags for those libraries.

### 7. Subscription (6A)

| Action | Entitlement `ereport` (or admin on **own** account) |
|--------|------------------------------------------------------|
| Create org, create report, import `.ereport` | Required |
| List orgs, open/edit report, cloud save, create invite, delete org/report, reorder/hide | Owner session only; **not** blocked when subscription lapsed |
| Invite collaborator after OTP | Invite session; no `ereport` subscription |
| API v1 | Key owner needs `api` + `ereport` entitlements as today (055/060); owner-only org paths; additive POST (070) |

   170|If the entitlements store is unavailable, **fail closed** (403), never skip the create gate.

### 8. API shape (behavioral)

Keep org JWT routes conceptually:

- `GET/POST/PUT /api/ereport/orgs`, `GET/DELETE /api/ereport/orgs/{orgId}`
- `POST …/orgs/{orgId}/reports`, import, `GET/PUT/DELETE …/reports/{reportId}`
- Invite create (owner JWT); invite OTP + get/put report (invite session)
- v1: `access` → `orgs` → `orgs/{orgId}/reports` → GET/POST report (070 merge, history files under the report dir, max 50)

   180|Any `ownerSafe` **path** segment is resolved from the session, never trusted from the client. Responses may still include display `ownerEmail` / username as non-authoritative metadata.

History: persist snapshots on the filesystem under the report directory for API overwrite **and** expose owner JWT list/restore for **org** reports.

### 9. Deploy

- Static site: `/var/www/eduardoos.com/html` (tracker HTML, Astro dist).
- API: `127.0.0.1:8081`.
- Nginx: proxy `/api/` to that addr; keep tracker exact locations and hub/workspace pretty-URL lookaheads so `/ereport-tracker.html` cannot 500; **no** public `/media/`.
- systemd: API `ReadWritePaths` includes the ereport media root only as needed; `UMask=0027`.
   190|- `EREPORT_MEDIA_ROOT` unset (local dev / tests) falls back to the in-memory object space, never to S3.

## Non-goals

- Migrating S3 `ereport/` prefixes (9A).
- A database document store for reports.
- Real-time multiplayer editing.
- Public unauthenticated file URLs.
- Cross-organization admin browsing.
- Requiring invitees to register (3A rejected).
   200|- Keeping capability-only invites without OTP (3C rejected).
- Requiring subscription for every edit (6B rejected).

## Acceptance

### Pass 1 — storage

- [x] No S3 imports or `S3_BUCKET` usage in `backend/internal/ereport`
- [x] eReport durable bytes are files under `EREPORT_MEDIA_ROOT`
- [x] Owner directory on disk is `<username>/<safe-email>/`
   210|- [x] Username segment comes from `Name`, falling back to the email local part
- [x] Renaming a user's `Name` does not move, rename, or orphan the owner directory (test)
- [x] Lookup resolves an existing owner directory by email whatever its username segment (test)
- [x] Path traversal in a key is rejected (test)
- [x] Writes are atomic (temp file + rename) so a crash cannot leave a truncated report (test)
- [x] Directory mode `0750`, file mode `0640` on Unix
- [x] `EREPORT_MEDIA_ROOT` unset falls back to memory, never S3
- [x] Existing eReport handler/org/API-v1 tests stay green against the filesystem space

### Pass 2 — identity & invites

   220|- [ ] IDOR: other session + known orgId/reportId → 403/404
- [ ] Admin cannot open another user's org
- [ ] Invite page public; OTP required; full tracker; expired invite 403
- [ ] New images are files with MIME/signature checks; X-Accel or auth stream; no public alias
- [ ] Create/import 403 without entitlement; PUT still 200 for lapsed owner
- [ ] Entitlements nil → 403 on create
- [ ] html2canvas/jsPDF not loaded from CDN
- [ ] v1 additive POST + filesystem history; no flat v1 paths
- [ ] AuthGate/routeAccess: `/ereport/invite` public
- [ ] Cookie sessions, rotating refresh tokens, CSRF
   230|
## Affected paths

Pass 1:

- `specs/072-ereport-vps-filesystem/spec.md` (this file)
- `backend/internal/ereport/fsobjects.go`, `objects.go`, `keys.go`, `handlers.go`
- `backend/cmd/server/main.go`
- VPS media directory, env `EREPORT_MEDIA_ROOT`

   240|Pass 2:

- `backend/internal/ereport/**` (invites, images, history)
- `frontend/src/components/Ereport/**`, `frontend/src/lib/ereport.ts`, `routeAccess.ts`, tracker HTML
- `nginx` site config
- Platform auth/session store shared with the rest of the site
