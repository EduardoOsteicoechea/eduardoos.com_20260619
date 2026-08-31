# Feature 043 — Music desktop seek height + admin upload modal

## Status

Shipped (2026-08-30).

## Problem

1. On desktop, the music seek/progress track feels too tall.
2. Admins need a header-dynamic-menu control to upload an audio file with a display name (not only the in-page mic recorder).

## Goals

1. **Desktop seek height:** At `min-width: 768px` only, the seek track (`.playlist-controls__seek-wrap` and its fill) is **0.5×** current height. Mobile/tablet below 768px unchanged.
2. **Header upload (admin only):** On `/media/musica`, register a `MusicHeaderMenu` into `#header-dynamic-menu-host` with a button that opens a modal:
   - Fields: **Nombre** (required text) + **Archivo** (required audio file: mp3/wav/m4a/aac/ogg/webm).
   - Submit → existing `POST /api/media/audio/upload` via `uploadWorshipRecording` with `title` = name and the picked file.
   - On success: same library + playlist refresh path as mic `SongRecorder` (`onRecorded` / append track).
   - Button visible only when `isApsAdminEmail`; non-admins see nothing.
   - Failures → ServerErrorModal (copyable).
3. Cancel / Escape closes modal without upload.

## Non-goals

- Changing upload auth (stays admin-only).
- Replacing or removing SongRecorder mic UI.
- Renaming S3 objects after upload beyond existing sanitize/title rules.
- Changing mobile seek height.

## Acceptance

- [x] Desktop (≥768px): seek wrap/fill height is half of pre-change values.
- [x] Mobile (<768px): seek height unchanged.
- [x] Admin sees upload button in header dynamic menu; non-admin does not.
- [x] Modal uploads with name + file; track appears in library/playlist.
- [x] `npm run build` green.

## Affected paths

- `specs/043-music-seek-upload-modal/spec.md`
- `frontend/src/components/PlaylistBuilder/PlaylistControls.css`
- `frontend/src/components/PlaylistBuilder/MusicHeaderMenu.tsx` (+ css)
- `frontend/src/components/PlaylistBuilder/PlaylistBuilder.tsx` (or MusicPage)
- `frontend/src/components/HeaderDynamicMenu/HeaderDynamicMenu.css` only if shared button classes needed
