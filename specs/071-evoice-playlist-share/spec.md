# Feature 071 — eVoice playlist share (email invite → copy into project)

## Status

**Implementing** (2026-09-04).

## Locked decisions

| # | Decision |
|---|----------|
| 1 | **Scope:** If the sharer has **any tracks checked** in Playlists, share **those** basenames. If **none** checked, share **all** MP3s in the current project. |
| 2 | **Incorporate = copy:** Accept copies audio **bytes** into the invitee’s chosen project under their own `evoice/{invitee}/…/audios/`. No live link to the sharer’s keys. |
| 3 | **Invite by email:** Owner creates invite → SMTP magic link → `/evoice/invite/?token=…`. |
| 4 | **Accept requires JWT + eVoice access** and the logged-in email must match the invite email (normalized). |
| 5 | **Expiry:** default **72h**; request may set `durationHours` 1…720. |
| 6 | **Name collisions:** if target project already has the same basename, write `{stem}.shared{N}.mp3` (N≥2). |
| 7 | **Docs are not shared** — audios only. |
| 8 | Invite token stored at `evoice/invites/{token}.json`. Reusable until expiry (same invitee email). |

## Problem

Users want to send an eVoice project playlist (or a checked subset) to another user by email so that person can pull those MP3s into one of their projects.

## Goals

- Share control on the **Playlists** section (icon + email modal).
- Email with magic link; landing page lists track names and lets invitee pick/create a target project, then **Import**.
- Server copies objects; invitee owns the copies independently.

## Non-goals

- Live streaming from sharer’s S3 without copy.
- Sharing source documents / vision / premium sidecars.
- Public (no-login) playback.
- Cross-account edit of the sharer’s originals.

## API

### Create (JWT + eVoice + canAccessOwner)

`POST /api/evoice/projects/{ownerSafe}/{project}/shares`

Body:

```json
{ "email": "friend@example.com", "files": ["a.v1.mp3"], "durationHours": 72 }
```

- `files` omitted or empty → all audios in project.
- Response `201`: `{ "invite": PlaylistShareInvite, "link": "https://…/evoice/invite/?token=…" }`
- Sends plain-text SMTP mail (same stack as eReport; skip if no mailer).

### Preview (public)

`GET /api/evoice/invite/{token}`

Response: `{ valid, expired, invite: { email, project, ownerSafe, files[{name,size}], expiresAt } }` — **no** audio bytes.

### Accept (JWT + eVoice; email must match invite)

`POST /api/evoice/invite/{token}/accept`

Body: `{ "project": "TARGET" }` — creates project markers if missing (same as create project).

Response: `{ "project", "imported": ["…"], "renamed": { "old": "new" } }`

## UI

- Playlists section: **Share** icon-only button → modal (email, optional note of N tracks / “all”, Send).
- Page `/evoice/invite/` (`requireAuth` true): token from `?token=`; show tracks; project select + new project; Import.

## Acceptance

- [x] Create share with checked subset and with empty selection (= all)
- [x] Email link + public GET preview
- [x] Accept copies into invitee project; collisions renamed
- [x] Wrong email / expired / no entitlement → error
- [x] Tests + FE build + commit/push

## Affected paths

- `specs/071-evoice-playlist-share/spec.md`
- `backend/internal/evoice/**` (shares, keys, models, handlers, tests)
- `backend/cmd/server/main.go` (Mail wire)
- `frontend/src/lib/evoice.ts`, `frontend/src/config/routes.ts`
- `frontend/src/components/Evoice/**`
- `frontend/src/pages/evoice/invite/index.astro`
- `.memory/MILESTONE-071-…`
