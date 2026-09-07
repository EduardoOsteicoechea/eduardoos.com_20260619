# Feature 025 — eReport (Issue Tracker + org hub + tracker)

## Status

**Shipped on S3/email keys (2026-08-20).** **New runtime is spec 072** (`specs/072-ereport-vps-filesystem/spec.md`), locked 2026-09-07.

Do **not** implement further S3, `SafeEmailKey` ownership directories, flat reports, capability-only invites, or CDN jsPDF/html2canvas. Those are obsolete. Tracker/HDS/org UX in this file and 046/049 still apply where 072 does not contradict them.

## Problem

Port the Issue Tracker into Eduardo OS as **eReport**: subscribed users store `.ereport` JSON, list/open by owner, set a **tema**, load from disk or cloud, and collaborate (org invites). **Storage and authz for new work: spec 072** (VPS filesystem under `media/ereport/<userId>/…`, no S3, no Mongo report blobs).

**Canonical tracker UI:** `frontend/public/ereport-tracker.html` (alias `frontend/public/ereport/tracker.html`). UX/styles synced to populado Issue Tracker (spec 049): Material Icons topbar, sticky section/group heads, collapse, inplace editors, `no_aplica`, tutorial + progress/save modals. Host `postMessage` bridge preserved.

## Goals

### 0. Subscription
- Catalog id: **`ereport`** — label “eReport”, $1/mo.
- Access: active entitlement **or** platform admin **on their own account**.
- **072:** entitlement required only to **create org / create report / import**. Invitees and lapsed owners may still open/edit per 072. **No** admin cross-organization file access.

### 1. Routes
| Path | UI |
|------|-----|
| `/ereport` | Redirect / gate → hub for current user |
| `/ereport/hub?user=` | Hub static shell (works without nginx rewrite) |
| `/ereport/{userSafe}` | Pretty hub URL (nginx → hub shell) |
| `/ereport/workspace?org=&report=` | Editor static shell (072: `user=` is **not** used for filesystem or authz) |
| `/ereport/{userSafe}/{reportId}` | Pretty editor URL (nginx rewrite + client `replaceState`) |

**Bugfix (2026-08-20):** Opening the pretty editor path before nginx rewrite is live served `/index.html` (home). Links and post-create navigation use `/ereport/workspace?…` first; nginx rewrite uses `rewrite … last` (not try_files→home).

**Bugfix (2026-08-20 #2):** iframe `/ereport/tracker.html` matched the one-segment hub rewrite → `/ereport/hub/index.html` then re-matched the two-segment editor rewrite in a loop → nginx **500**. Fix: exact `location = /ereport/tracker.html` + lookaheads that exclude `hub/` and `workspace/` prefixes (not only exact `hub` end).

**Bugfix (2026-08-20 #3):** Tracker iframe moved to **`/ereport-tracker.html`** (outside `/ereport/…` pretty-URL rewrites) so a stale nginx config cannot 500 the iframe even before nginx redeploy.

### 2. Object layout — **superseded by 072**

**Do not use S3 or email-safe path segments in new code.** Historical S3 layout (shipped, not migrated — 072 decision 9A):

```
# LEGACY ONLY — not the target runtime
ereport/{ownerSafe}/library.json
ereport/{ownerSafe}/reports/{reportId}/meta.json
ereport/{ownerSafe}/reports/{reportId}/report.ereport
ereport/{viewerSafe}/shared-index.json
```

**Target (072):**

```
/var/www/eduardoos.com/media/ereport/<owner-user-id>/orgs/<org-id>/reports/<report-id>/
```

Email/username in JSON are display-only. `ownerUserId` is the directory name. New images are files under `images/`; no new base64; no S3.

### 3. Hub behavior
- **072 / 046:** org dashboard (orgs, register, recent, manage). **No** flat “Compartidos conmigo” in the new runtime (5B). Collaboration is org/report **invites** with email OTP (072 3B), not registered-user share lists on flat reports.
- Create/import reports **under an org**.
- Click card → editor (`/ereport/workspace?org=&report=`).

### 4. Editor
- **No host chrome above the iframe.** All editor tools live in the site **Header dynamic slot** (`#header-dynamic-menu-host`), same pattern as Scrib/Homescool/Pamphlet.
- **No Issue Tracker topbar** inside the iframe. The former `.topbar` (“Issue Tracker” title + icon row) is **removed**. Meta fields (Organization, Report name, Fecha, Número) stay in the edit body.
- **HDS icon groups** (icon-only; Material Symbols or SVG; `title`/`aria-label` required):
  1. **Tracker tools** (host → iframe `postMessage` `{ target: "ereport-tracker", type: "command", command }`):
     - Tutorial (`tutorial`) — opens howto modal in iframe
     - Toggle sidebar (`toggle-sidebar`)
     - Font up / down (`font-up` / `font-down`)
     - Upload `.ereport` (`upload`) — triggers hidden file input in iframe
     - Clear all (`clear-all`) — confirm + reset in iframe
     - Progress (`progress`) — opens progress modal in iframe
     - Download export (`save-export`) — opens save modal → download `.ereport`+HTML+PDF (+ cloud-save bridge). **Regular HDS chrome** (not green); Material icon **`download`**.
  2. **Host tools** (modals on the page):
     - **Hub** — CTA to leave to the owner hub
     - **Tema** — tema text field (blur/save writes meta)
     - **Guardar en nube** — confirm + status; runs collect → `PUT` cloud. **Only this HDS control is green** (class `ereport-hds-cloud-save`).
     - **Compartir** — **072:** org/report magic invite + OTP (not flat `sharedWith` emails). Invitees get the **full tracker**.
     - **Historial** — overwrite snapshots on the **filesystem** under the org report directory (owners).
- Body: Issue Tracker embedded via host-bridged static HTML at **`/ereport-tracker.html`** (alias `/ereport/tracker.html`).
- **Viewport fill (locked):** Under `html.layout-editor-bleed` (spec 054), the host `.ereport-editor` + tracker iframe must occupy the full remaining window under the site Header/rail — not a short band at the top with empty page chrome below. Do **not** rely on `height: 100%` alone through Astro’s `astro-island` wrapper; use an explicit viewport height (`calc(100dvh - var(--header_offset, …))` and/or fixed inset like Scrib) so the iframe always stretches.
- **Bug fix (2026-09-02):** Bleed CSS set `min-height: 0` / `height: 100%` on the editor and frame; the percentage chain broke at the island, so the iframe collapsed to a short strip. Restore explicit viewport sizing.
- **Theme:** Tracker has **no** local light/dark button. Appearance follows the site Header theme toggler (`eduardoos-theme` / `html[data-theme]`). Host pushes `postMessage` `{ type: "theme", dark }` on boot, after payload load, and whenever the document theme attrs change.
- **Nav sidebar dots:** color by item status — **green** `aprobado`, **red** `reprobado`, **gray** undefined/empty. Active item keeps a gold focus ring without replacing the status fill.
- **Inline title edit (tracker):** sección máxima and subsección/grupo titles are **always `<input>` fields** styled as headings (click/focus to edit). Enter or blur commits into state; values persist in `.ereport` via `collectFromDom`.
- Save export from HDS: downloads (download icon, regular chrome) and may bridge to cloud; **green accent is only on Guardar en nube**.
- Cloud save also from header modal and when tracker `saveAll` completes (bridge).
- **Auto cloud save (2026-09-03):** any edit in the tracker (meta, inplace fields, status, images, collapse state) debounces to `cloud-save` → host `PUT` without opening the Guardar modal.
- **Global type scale (2026-09-03, spec 063):** tracker root `html` uses `calc(16px * var(--site-text-scale))`; internal sizes stay in **rem** so proportions are unchanged. Host pushes `text-scale` on boot and when A+/A− changes; HDS font up/down bumps site scale on the host.
- Owner: full edit + invites. Invite collaborator (OTP-bound session): **view + edit body** in the tracker (not delete org/report / not manage invites). Non-owner without a valid invite: 403. **No** platform-admin bypass into another user’s tree (072 7B).

### 5. API (JWT / cookies — **072**)

Org-scoped routes under `/api/ereport/orgs/…` (046/060/072). **Drop** flat `/api/ereport/reports/{ownerSafe}/…` and `/shares` from the new runtime. Do **not** use email as a filesystem key.

Historical S3 IAM (`eduardoos20260607/ereport/*`, `eduardoos-ec2-s3-role`) is **not** part of new eReport. Failures are filesystem permissions / `EREPORT_MEDIA_ROOT`.

## Non-goals
- Real-time multi-cursor collaboration.
- Public unauthenticated **file** URLs (invite **page** is public; files go through Go after OTP).
- S3 or Mongo as the report blob store (072).
- Migrating existing S3 eReport data (072 9A).

## Acceptance
- [x] Catalog + Subscribe + Services menu “eReport”
- [x] Hub list / create / import / open
- [x] Editor tema + tracker + cloud save under `ereport/`
- [x] Share with registered users; they see report in “Compartidos”
- [x] nginx pretty URLs; tests; FE build; commit + push
- [x] Section + group headings inline-editable in tracker
- [x] Hub / Tema / Guardar / Compartir in Header dynamic slot via modals (no chrome above iframe)
- [x] Workspace editor iframe fills the window under Header/rail (no collapsed top strip)
- [x] Tracker topbar removed; former topbar icons live in HDS and drive iframe via `command` postMessage
- [x] Meta panel (org / report name / date / number) remains in the edit body
- [x] Tracker fields use site global type scale (16px × `--site-text-scale`); internal rem ratios preserved
- [x] Tracker edits auto-save to cloud (debounced) without opening Guardar modal
- [ ] **072 cutover** — VPS filesystem, userId paths, invite OTP + tracker, org-only, no S3 (see `specs/072-ereport-vps-filesystem/spec.md`)

## Affected paths
- `specs/072-ereport-vps-filesystem/spec.md` (new runtime)
- `specs/025-ereport/spec.md`
- `backend/internal/ereport/**`, `payments/catalog.go`, `cmd/server/main.go`
- `frontend/.../ereport/**`, `lib/ereport.ts`, Header, payments, routes, nginx
- `frontend/public/ereport-tracker.html`, `frontend/public/ereport/tracker.html` (+ host bridge)
- `frontend/src/components/Ereport/EreportHeaderMenu.tsx` (+ modals)
