# Feature 038 — Music playback, flattened nav, pamphlet copy

## Status

Active (2026-08-30).

## Problem

1. **Music:** Tracks on `/media/musica` list but do not play. HTML5 `<audio>` sends `Range` and needs a real audio `Content-Type`; the media file proxy currently always returns `200` with the S3 object type (often `application/octet-stream`) and ignores Range. Stale IndexedDB blobs can also block playback.
2. **Global menu:** Product links sit under a nested **Services Apps & Subscriptions** toggle. Users must expand a submenu to reach Music, Pamphlet, etc. Links are shown even when the account has no subscription.
3. **Pamphlet copy:** Duplicating a pamphlet is easy to miss (row icon only). A dedicated **copy existing** action is needed. Copy must **never** delete, recycle, or overwrite the source; the clone must have a new id and a new title.

## Goals

### 1. Music playback

- `GET`/`HEAD` `/api/media/file/*` honors `Range` (respond `206` + `Content-Range` + `Accept-Ranges: bytes` when a valid range is requested).
- Playback `Content-Type` prefers the audio MIME from the file extension when S3 reports a generic type (`application/octet-stream`, `binary/octet-stream`, empty).
- Nginx `/api/media/file/` does not buffer the stream (`proxy_buffering off`) so the player can start before the whole file is downloaded.
- Frontend: if an IndexedDB offline blob is not playable audio, skip it and use the remote URL when online.
- Do not require JWT on media file GET/HEAD (`<audio src>` cannot send Bearer).

### 2. Flatten global menu; hide by subscription

- Remove the **Services Apps & Subscriptions** nested toggle.
- Render those product links as **top-level tray links**, same level as Contact (same `<a>` styling).
- **Always visible (not billable):** Home, Contact, Articles, Calvin’s Institutes, BIM IFC viewer (tray order: spec 052).
- **Subscription-gated (hide unless allowed):** Homescool (`homescool`), Music (`playlist`), Pamphlet (`pamphlet`), Scrib (`scrib`), eReport (`ereport`). Church stays behind `CHURCH_FEATURE_ENABLED` and `church-management`.
- Allowed = platform admin **or** active entitlement for that service id. Homescool also shows for linked students (`checkServiceAccess` student bypass).
- Logged out: gated links hidden; public links stay.
- While entitlements are loading for a non-admin signed-in user: show public links only (no flash of gated apps).
- Admin-only rows (Admin users, Agent Sandbox) stay as today. (MPS tests submenu retired — see specs 030/031.)
- Subscribe remains in the account menu (not a nested services dropdown).

### 3. Create pamphlet by copying an existing one

- Pamphlet header toolbar: new **Copy existing pamphlet** control next to New (`#btn-copy`).
- Opens the cloud list in **copy** intent (not delete). User picks a source `.epam`.
- Server path remains `POST /api/epams/{id}/copy`:
  - New UUID `epamId` (and document `id`).
  - New title `{sourceTitle}_{n}` (smallest unused n ≥ 1 for that user).
  - Full clone of header/body/footer/template/images.
  - **Must not** `Delete` the source, move it to recycle-bin, or `Save` over the source id.
- After copy, open the **new** pamphlet in the editor. Source remains in the cloud list with its original id and title.
- Existing per-row **Crear copia** in Open → From the cloud stays: clone only, refresh list, do not open, do not delete source.
- Copy of a missing id is 404. Unauthenticated is 401.

## Non-goals

- Changing PDF geometry, pamphlet template types, or footer profiles.
- Making Music require a ServiceGate on the page itself (nav hide is enough for this turn).
- Flattening admin nav beyond what 030/031 retirement already removed.
- Copying local (device-only) files that were never saved to the cloud.

## Acceptance

- [x] Play on `/media/musica` starts audio for a library track (Range 206 or full 200 with audio MIME + `Accept-Ranges`).
- [x] Global tray has no “Services Apps & Subscriptions” button; gated apps appear only when entitled/admin/student (Homescool).
- [x] Copy existing: new pamphlet has different id and title; `GET` of the source still returns the original document.
- [x] `go test ./internal/content/...` green; `npm run test:service-access` green; `npm run build` green.

## Affected paths

- `specs/038-music-nav-pamphlet-copy/spec.md`
- `backend/internal/content/media.go`, `media_test.go`, `footer_handlers.go`, `copy_footer_test.go`
- `nginx/default.conf`
- `frontend/src/components/Header/**`, `frontend/src/lib/navServices.ts`, `frontend/src/lib/serviceAccess.test.mjs`
- `frontend/src/components/PlaylistBuilder/PlaylistBuilder.tsx`, `frontend/src/lib/offlineAudio.ts`
- `frontend/src/lib/pamphlet-generator/src/shell.ts`, `main.ts`

## Telemetry

- Existing `media.file` miss logs; log Range requests at debug/info as today.
- Existing `epams.copy` log (user, sourceId, newId, newTitle) — copy must not emit `epams.delete`.
