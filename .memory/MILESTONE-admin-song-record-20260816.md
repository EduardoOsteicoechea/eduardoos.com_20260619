# Milestone: Admin song recording → playlist + S3 + lyrics — 2026-08-16

## Status: SHIPPED on `master`

| Commit | Message |
|--------|---------|
| `cf557ae` | feat/test: admin-only worship audio upload to S3 |
| `eaa7e26` | feat/test: admin MediaRecorder lands in playlist with lyrics |

## What shipped

### UX (`/media/musica`)
- Admin-only `SongRecorder` (MediaRecorder / mic) above the library grid.
- Non-admins never see the control (`isApsAdminEmail`).
- On stop: upload → track appears in library **and** session playlist → selected → empty `.emusic` ensured for the existing lyrics editor.

### API
- `POST /api/media/audio/upload` (JWT + APS admin allowlist)
  - multipart `file` (+ optional `title`, `prefix`)
  - stores under `media/worship_playlists/`
  - **403** `admin only` for non-admins; **401** without JWT; **503** without S3
- Existing `PUT /api/emusic/{slug}` still used for lyrics shell / edit (admin).

### Tests
- Go: `TestUploadMediaAudioRejectsNonAdmin`, auth/missing-file/no-S3 cases, filename sanitize
- Frontend: `npm run test:media-recording`; `npm run build` green

## Non-goals / preserved
- Regular users keep play / reorder / lyrics **view** / offline `.emusics` pack behavior unchanged.
- Contact chat UI changes elsewhere were left unstaged.
