# Feature 072 — eReport VPS filesystem + platform Mongo (no S3)

## Status

**Spec locked** (2026-09-07) — user approved `1A 2B 3B 4A 5B 6A 7B 8A 9A 10B` plus the filesystem/auth rules below.

**Do not implement production code in the same turn as this lock.** Implementation starts only after this spec is in the repo and a later turn is asked to code from it.

This spec is the **source of truth for new eReport runtime**. It supersedes S3, email-key paths, flat reports, capability-only invites, CDN export scripts, and Mongo-for-report-blobs.

Related shipped UX (still valid unless this file contradicts it): tracker/HDS (025 §4, 049), org hub (046), additive API POST (070), validation criteria (068), viewUrl (062), connector skill (063/064).

## Problem

Shipped eReport stores JSON under S3 keys derived from email (`SafeEmailKey`), authorizes some routes from client `ownerSafe`, uses localStorage JWTs, and treats magic links as bearer capabilities. The target site stores **report bytes only on the VPS**, authorizes from an **immutable user id in the session**, and keeps **MongoDB for platform identity only**.

## Locked decisions (verbatim map)

| # | Choice | Meaning |
|---|--------|---------|
| 1A | Filesystem objects | Report JSON, metadata, history, invites, extracted images live under `/var/www/eduardoos.com/media/ereport/` |
| 2B | Extract new images | New images become validated files; do **not** write new base64; do **not** batch-migrate old base64 |
| 3B | Magic link + email OTP | Invitee needs **no** Eduardo OS account; must prove the invited email via OTP |
| 4A | Full tracker | Invite collaborators use the same Issue Tracker iframe as owners |
| 5B | Org reports only | New runtime has **no** flat `…/reports/{id}` library, shares, or JWT history for pre-org reports |
| 6A | Subscribe to create | Active `ereport` entitlement (or platform admin) required to **create org / create report / import**. Open, edit, invite, delete stay available to the owner without a current subscription |
| 7B | No admin cross-org | Platform admin does **not** read or write another user’s eReport directories |
| 8A | Mongo = platform only | Users, roles, sessions, refresh tokens, OTPs, entitlements, API keys, authorization **checks** (session → user id, role, entitlements). **No** Mongo collections for eReport payloads, meta, history, invites, or images |
| 9A | No S3 migrate | Do not copy `s3://…/ereport/`. Greenfield filesystem. S3 stays out of **new** eReport runtime code and config |
| 10B | Vendor export libs | Bundle/vendor `html2canvas` and `jsPDF` in the frontend build; no jsDelivr (or other) CDN for those in the tracker |

## Goals

### 1. Storage root (mandatory)

All eReport durable files:

```
/var/www/eduardoos.com/media/ereport/
```

Environment name: `EREPORT_MEDIA_ROOT` (default that path on the VPS). The API process must be the only writer. Directory mode `0750`, files `0640`.

**Forbidden**

- Mongo collections (or Dynamo/S3) for report payloads, org/report metadata, history snapshots, invite documents, or images.
- Locating or authorizing files from a **client-supplied** email, username, path, or report id **alone**.
- Public Nginx alias of `/media/` or `/var/www/eduardoos.com/media`.
- S3 SDK, `S3_BUCKET`, IAM `ereport/*`, or signed URLs in new eReport code/config.
- Deriving the owner directory from email (`SafeEmailKey`) or username.

### 2. Owner directory = JWT/session user id

The Go API derives the owner filesystem directory **only** from the authenticated principal’s **immutable user id** (`userId`, UUID stored on the user record in Mongo). Email and username are **display metadata** in org/report JSON. Changing email or username **must not** rename or move directories.

Canonical report directory:

```
/var/www/eduardoos.com/media/ereport/<owner-user-id>/orgs/<org-id>/reports/<report-id>/
```

Suggested files (names may be refined in implementation as long as they stay under this directory):

```
<meta.json>              # id, orgId, ownerUserId, tema, dates, display ownerEmail/username, updatedAt
<report.ereport>         # tracker payload; image refs are file ids/URLs, not new base64
<history-index.json>
<history>/<snapshot-id>.json
<images>/<image-id>.<ext>
```

Org index (same owner id, not email):

```
/var/www/eduardoos.com/media/ereport/<owner-user-id>/orgs.json
/var/www/eduardoos.com/media/ereport/<owner-user-id>/orgs/<org-id>/meta.json
/var/www/eduardoos.com/media/ereport/<owner-user-id>/orgs/<org-id>/library.json
```

Invite documents (not under a client-supplied path; id is server-generated):

```
/var/www/eduardoos.com/media/ereport/invites/<invite-id>.json
```

The raw magic secret is stored **hashed**. Lookup is by server-side hash of the presented token (or `invite-id` + hash check), never by email in the path. Invite JSON holds `ownerUserId`, `orgId`, optional `reportId`, `invitedEmail` (display + OTP target), `scope` (`org` | `report`), `expiresAt`, `canEdit`.

### 3. Authorization (Go only)

File access is **never** Nginx-static. Browser and API clients call Go. Private bytes (JSON, images, history) are served with **authenticated** Go handlers; large files may use Nginx **internal** `X-Accel-Redirect` to:

```
alias /var/www/eduardoos.com/media/;
internal;
```

A request is allowed only if one of:

1. **Owner** — session `userId` equals `ownerUserId` on the resource (directory is `…/ereport/<that-user-id>/…`).
2. **Invite collaborator** — valid **invite session** after email OTP for `invitedEmail`, invite not expired, scope covers the org or report.
3. **Explicit approved permission** — only if later spec’d as a filesystem ACL file under the owner tree. **Not** platform-admin cross-org (decision 7B). No “admin can open any `ownerSafe`” behavior from spec 025.

`orgId` / `reportId` in the URL are **insufficient**. The server loads the resource from the **ownerUserId it already established** via session or invite record, then checks the ids match. A guessed UUID under another user’s tree must 404/403 without leaking existence beyond generic not-allowed.

Platform admin (`role=admin`): same as a normal user for **eReport files** — only their own `userId` directory. Admin still bypasses **subscription** checks (catalog) for **their own** create/import if that remains the global payments rule; they do **not** gain other users’ reports.

### 4. Authentication (platform Mongo)

Site (not API keys):

- Short-lived **access JWT in Secure HttpOnly cookie**.
- **Opaque rotating refresh token**, hashed in Mongo.
- CSRF strategy required because cookies are sent automatically (`SameSite` + CSRF token or equivalent).
- Session / JWT `sub` or custom claim carries **`userId`** (immutable). Email in claims is optional display only.

Invitees (3B): **no** user account required. Flow:

1. Owner creates invite (JWT owner session); file written under `invites/`; email sent with landing URL + secret.
2. `/ereport/invite/` is a **public page** (`isPublicPagePath` / AuthGate must not force login).
3. Invitee proves `invitedEmail` with OTP persisted in **Mongo** (platform OTP store), not in the invite file as plaintext.
4. On success, Go sets a **scoped invite cookie** (not a full user) bound to `invite-id` + expiry ≤ invite `expiresAt`.
5. Tracker editor loads via JWT-less invite endpoints that authorize from that cookie + hashed token rules.

Durations remain 046: report invite **1 hour** from issuance (unless a later owner override is spec’d); org invite duration chosen in the modal, min 1h, max 30 days.

### 5. Images (2B)

- Tracker uploads and any **new** image bytes the server accepts are written under `…/reports/<report-id>/images/` with a server-generated id, extension from **magic bytes** (allowlist: JPEG, PNG, WebP, GIF — **not** SVG/HTML).
- Max size per image and per report: set in implementation constants; reject oversize.
- Payload stores `{ id, mime, name }` (and API URL), **not** new `dataUrl` base64.
- Serving: Go authz then `X-Accel-Redirect` (or small files streamed by Go).
- **No** migration of S3 objects (9A). **No** conversion pass of historical S3 base64.
- If a user **imports** a local `.ereport` that still contains `dataUrl` fields: leave those blobs in the JSON (do not batch-migrate); **new** images added after import follow the file rule. Do not persist newly captured camera/file picks as base64.

### 6. Product surface (org only, 5B)

Hub and APIs are org-first (046). **Do not** ship in the new runtime:

- Flat `ereport/<email>/reports/…`
- `library.json` / `shared-index.json` email trees
- JWT `GET/PUT /api/ereport/reports/{ownerSafe}/{reportId}` and `/shares` and flat `/history`
- v1 `legacyReports` and `GET/POST /api/v1/ereport/reports/{ownerSafe}/{reportId}`

Pretty URLs must not be used as filesystem keys. Preferred editor URL remains `/ereport/workspace?org=&report=` (062 `viewUrl` without `user=` as an authz parameter). If `user=` remains for display, Go **ignores** it for path construction.

Invite UI: **full tracker** (`EreportEditor` or equivalent iframe), not the raw JSON textarea.

Export: vendor html2canvas + jsPDF into `frontend/` (imported by tracker or a built tracker bundle). Remove `cdn.jsdelivr.net` script tags for those libraries.

### 7. Subscription (6A)

| Action | Entitlement `ereport` (or admin on **own** account) |
|--------|------------------------------------------------------|
| Create org, create report, import `.ereport` | Required |
| List orgs, open/edit report, cloud save, create invite, delete org/report, reorder/hide | Owner session only; **not** blocked when subscription lapsed |
| Invite collaborator after OTP | Invite session; no `ereport` subscription |
| API v1 | Key owner needs `api` + `ereport` entitlements as today (055/060); owner-only org paths; additive POST (070) |

If entitlements store is unavailable, **fail closed** (403), never skip the create gate.

### 8. API shape (behavioral)

Keep org JWT routes conceptually:

- `GET/POST/PUT /api/ereport/orgs`, `GET/DELETE /api/ereport/orgs/{orgId}`
- `POST …/orgs/{orgId}/reports`, import, `GET/PUT/DELETE …/reports/{reportId}`
- Invite create (owner JWT); invite OTP + get/put report (invite cookie)
- v1: `access` → `orgs` → `orgs/{orgId}/reports` → GET/POST report (070 merge, history files under the report dir, max 50)

Replace any `ownerSafe` **path** segment with server-side `userId`. Responses may still include display `ownerEmail` / username as non-authoritative metadata.

History: persist snapshots on the filesystem under the report directory for API overwrite **and** expose owner JWT list/restore for **org** reports (gap in shipped 025 history, which was flat-only).

### 9. Deploy

- Static site: `/var/www/eduardoos.com/html` (tracker HTML, Astro dist).
- API: `127.0.0.1:8081`.
- Nginx: proxy `/api/` to that addr; keep tracker exact locations and hub/workspace pretty-URL lookaheads so `/ereport-tracker.html` cannot 500; **no** public `/media/`.
- systemd (or equivalent): API `ReadWritePaths` includes the ereport media root only as needed.

## Non-goals

- Migrating S3 `ereport/` prefixes (9A).
- Mongo document store for reports.
- Real-time multiplayer editing.
- Public unauthenticated file URLs.
- Cross-organization admin browsing.
- Requiring invitees to register (3A rejected).
- Keeping capability-only invites without OTP (3C rejected).
- Requiring subscription for every edit (6B rejected).

## Acceptance (implementation turn — all unchecked until coded)

- [ ] No S3 imports/env in `backend/internal/ereport` or ereport-specific IAM
- [ ] Paths use `<owner-user-id>/orgs/<org-id>/reports/<report-id>/` only
- [ ] Email/username changes do not move directories (test)
- [ ] IDOR: other userId + known orgId/reportId → 403/404
- [ ] Admin cannot open another user’s org
- [ ] Invite page public; OTP required; full tracker; expired invite 403
- [ ] New images are files with MIME/signature checks; X-Accel or auth stream; no public alias
- [ ] Create/import 403 without entitlement; PUT still 200 for lapsed owner
- [ ] Entitlements nil → 403 on create
- [ ] html2canvas/jsPDF not loaded from CDN
- [ ] v1 additive POST + filesystem history; no flat v1 paths
- [ ] AuthGate/routeAccess: `/ereport/invite` public
- [ ] Tests: authz, ownership, invite OTP, upload, path traversal, API, UI states

## Affected paths (when coding begins)

- `specs/072-ereport-vps-filesystem/spec.md` (this file)
- `specs/025-ereport/spec.md`, `specs/046-…`, `specs/060-ereport-api-orgs/spec.md` (supersession notes)
- `backend/internal/ereport/**`, `backend/cmd/server/main.go`
- `frontend/src/components/Ereport/**`, `frontend/src/lib/ereport.ts`, `routeAccess.ts`, tracker HTML
- `nginx` site config, VPS media directory, env `EREPORT_MEDIA_ROOT`
- Platform auth/session/Mongo (users, cookies, refresh, OTP) as a prerequisite shared with the rest of the new site
