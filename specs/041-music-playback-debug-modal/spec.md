# Feature 041 — Music playback diagnostic modal

## Status

Shipped (2026-08-30) — diagnosis only; root playback fix is a follow-up.

## Problem

Tracks on `/media/musica` still do not play after 038 (Range/MIME). Failures are mostly silent (`setError` line or swallowed load errors), so we cannot see whether the cause is URL encoding, HTTP status, Content-Type, Range, stale offline blob, decode, or autoplay policy.

## Goals

1. On playback failure (load error, empty src, offline miss, `audio.play()` reject), open the existing **ServerErrorModal** with a **copyable** diagnostic block.
2. Diagnostics must include at least:
   - track key / display name
   - resolved `audio.src` (clipped if huge)
   - source kind: `remote` | `offline_blob` | `local_blob` | `none`
   - `navigator.onLine`
   - `MediaError` code + label when present
   - `readyState` / `networkState`
   - play/load exception message when present
3. For **non-blob** remote URLs, run a short probe: `GET` with `Range: bytes=0-1`, and append status + `Content-Type` + `Accept-Ranges` + `Content-Range` + `Content-Length` (or probe error).
4. Keep inline `playlist-builder__status--error` text as today; modal is additive.
5. Do **not** change backend/nginx in this turn — diagnosis only.

## Non-goals

- Fixing the root playback bug (follow-up after reading modal output).
- Changing playlist UI layout or offline pack UX.
- Requiring JWT on media file GET.

## Acceptance

- [x] Play/load failure opens ServerErrorModal with copyable diagnostics.
- [x] Remote probe lines appear when `src` is `/api/media/file/...`.
- [x] Blob/offline failures still open the modal (probe skipped with reason).
- [x] `npm run build` green.

## Affected paths

- `specs/041-music-playback-debug-modal/spec.md`
- `frontend/src/components/PlaylistBuilder/PlaylistBuilder.tsx`
- optional: `frontend/src/lib/playbackDiagnostics.ts` if helpers are extracted
