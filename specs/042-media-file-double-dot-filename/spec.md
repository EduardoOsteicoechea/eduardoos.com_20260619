# Feature 042 — Media file path allows `..` inside filenames

## Status

Shipped (2026-08-30).

## Problem

Playback probe on production returned `HTTP 400` `{"error":"invalid path"}` for:

`/api/media/file/worship_playlists/Ayúdame. Cánticos espirituales..mp3`

Root cause: `GetMediaFile` rejects any path containing the substring `".."`, which also matches legitimate filenames that end with `..mp3` (double period before extension). Browser then reports `MEDIA_ERR_SRC_NOT_SUPPORTED` / Format error because the body is JSON, not audio.

## Goals

1. Treat path traversal as **path segments** equal to `..` (and optionally `.` alone), not as a substring anywhere in the key.
2. Allow filenames like `espirituales..mp3`, `a..b.mp3`.
3. Still reject `../`, `foo/../../bar`, `..\`, and cleaned escapes that leave the media prefix.
4. Unit test covering the exact production filename pattern (unicode + `..mp3`).
5. Black-and-white playback path otherwise unchanged (Range/MIME from 038).

## Non-goals

- Renaming S3 objects.
- Changing frontend URL encoding.
- Removing the diagnostic modal (041 stays).

## Acceptance

- [x] `GET /api/media/file/worship_playlists/Ayúdame. Cánticos espirituales..mp3` does **not** return 400 invalid path (404 if missing in S3 is OK).
- [x] `GET .../foo/../secret.mp3` still returns 400 invalid path.
- [x] `go test ./internal/content/...` green.
- [ ] After deploy, play of that track returns audio (or 404 if object truly missing — not JSON format error).

## Affected paths

- `specs/042-media-file-double-dot-filename/spec.md`
- `backend/internal/content/media.go`
- `backend/internal/content/media_test.go`
