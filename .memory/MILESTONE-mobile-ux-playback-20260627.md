# Milestone: Mobile UX Scale + Playlist Playback Fix — 2026-06-27

## Status: SHIPPED on `master`

| Commit | Message |
|--------|---------|
| `a729537` | feat: 1.5x mobile UI scale for fonts and controls below 1024px |
| `2077d8b` | fix: satisfy go vet in media path encoding test |
| `39dc235` | fix: worship playlist audio URLs with unicode and path slashes |

Branch `master` deployed to production. User confirmed playlist playback works after URL fix.

---

## 1. Playlist playback fix (production)

**Problem:** `/api/media/file/...` returned 404 for worship MP3s with spaces/accents on deploy.

**Root cause:** `url.PathEscape` on the full relative path encoded `/` as `%2F`, breaking nginx/chi routing.

**Fix:**
- `pkg/s3store.EncodeRelativePath()` — encode per segment, keep literal `/`
- Backend audio/image list URLs + file proxy use segment encoding
- Frontend `normalizeMediaPlaybackUrl()` — rewrite legacy `%2F` URLs from cached API responses
- Tests: `pkg/s3store/meta_path_test.go`, `frontend/src/lib/mediaLibrary.test.ts`

---

## 2. Mobile UI scale (1.5×)

**Goal:** Larger fonts and touch targets on phone/tablet only; desktop unchanged.

**Implementation:**
- `--ui-scale: 1.5` on `:root` for viewports **&lt; 1024px**
- `--ui-scale: 1` at **≥ 1024px** (current desktop sizes preserved)
- Scaled tokens: root `font-size` (12px → 18px), `--control_min_*`, `--header_height`, `--activity-bar-height`
- All `rem`-based `--font-*` tokens scale automatically via root font size
- Files: `frontend/src/styles/theme.css`, `frontend/src/styles/global.css`

**Verify after deploy:** DevTools → `:root` shows `--ui-scale: 1.5` and `font-size: 18px` below 1024px width. Hard-refresh on PWA if styles look stale.

---

## Next up

See `.memory/PLAN-pamphlet-document-generator.md` — Pamphlet Document Generator integration.
