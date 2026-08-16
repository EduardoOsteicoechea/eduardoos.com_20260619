# Static assets migration — legacy `frontend/public` → Next

**Goal:** Duplicate every durable static file from the legacy Astro tree into
`eduardoos-next/frontend/public/` so the parent `frontend/` tree can be deleted
in a later stage without breaking favicons, home imagery, playlist seeds, or
lyrics.

**Do not delete** parent `frontend/` until the cutover checklist below is green.

Inventory date: **2026-08-16**. Source of truth for paths: legacy
`frontend/public/**` (skip `frontend/dist/`, `node_modules/`).

---

## Inventory (legacy `frontend/public`)

| Category | Count | Notes |
|----------|------:|-------|
| Favicons (`favicon.svg`, `.ico`, PNG sizes 16–192 + apple 180) | 8 | Header logo + `<link rel="icon">` in layouts |
| UI icons (Material `*_24dp_*.svg`, `icons.svg`, `print.svg`) | 14 | Playlist/legacy `<img>` paths; Next playlist UI prefers inline SVG |
| Lyrics (`.emusic`) | 5 | Under `lyrics/` |
| Audio seeds (`.mp3`) | 5 | Local worship demo tracks at public root |
| Personal photos (`.jpg` / `.webp`) | 4 | Home hero (`personal_photo_1080x1920_side_placed.webp`) |
| Source / editor (`personal_photo_cropped.xcf`) | 1 | GIMP source; kept for parity, not required at runtime |
| **Legacy total** | **37** | |

### Already in Next before this sync

| Category | Count | Status |
|----------|------:|--------|
| Favicons (all 8) | 8 | On disk + identical hashes; PNGs/ICO were untracked until this commit |
| Lyrics | 5 | Tracked + identical |
| OpenBIM WASM (`web-ifc/*.wasm`) | 3 | **Next-only** (postinstall/prebuild); keep forever |

### Gap closed this pass

| Category | Count | Action |
|----------|------:|--------|
| UI icons + `icons.svg` + `print.svg` | 14 | Copied path-preserving |
| Audio seeds `.mp3` | 5 | Copied |
| Personal photos | 4 | Copied |
| `.xcf` source | 1 | Copied (optional for runtime; needed for full tree parity) |
| Favicon PNG/ICO git tracking | 7 | Stage into git (were present but untracked) |

**Post-copy check:** every legacy public file exists under Next with matching
SHA-256. Next has **40** files = 37 legacy + 3 `web-ifc` WASM.

---

## What must live elsewhere (not `public/`)

| Asset | Location | Status |
|-------|----------|--------|
| Pamphlet generator toolbar icons | `frontend/src/lib/pamphlet-generator/assets/icons/` | Already mirrored in Next (bundled via `?url` imports) |
| Google Fonts (Montserrat, Raleway, Roboto, Cormorant) | CDN links in `BaseLayout` / `PamphletLayout` | Not static files |
| Built HTML/CSS/JS | `frontend/dist/` (and `dist-build/`) | Generated; never copy as source |
| Media in S3 / Dynamo (`media/…`, profiles, playlists) | Object storage + API | Out of scope for this static copy |
| Nginx / Certbot configs | parent `nginx/` | Deploy concern, not frontend public |

No `robots.txt`, `site.webmanifest`, or self-hosted font files were found under
legacy `frontend/public`.

---

## Favicon + header logo (mandatory)

User requirement: **legacy** `frontend/public` favicons are the brand mark for
Next.

- Header logo: `Header.tsx` → `/favicon.svg`
- Document icons: `BaseLayout.astro` / `PamphletLayout.astro` → `/favicon.svg`,
  `/favicon.ico`, `/favicon-{16,32,48,96,192}.png`, apple `/favicon-180.png`

All of the above are identical to legacy after this sync. Do not replace with a
placeholder mark before deleting the old tree.

---

## Cutover checklist (before deleting legacy `frontend/public`)

- [x] Path-preserving copy of all legacy `public/**` into `eduardoos-next/frontend/public/**`
- [x] SHA-256 parity for all 37 legacy files
- [x] Favicon set committed (SVG + ICO + PNGs)
- [ ] Confirm production/staging deploy publishes `public/` into the Astro
      `dist` (or serves them at site root) so `/favicon.svg` and photo URLs resolve
- [ ] Smoke: home loads `/personal_photo_1080x1920_side_placed.webp` (when home
      uses that asset)
- [ ] Smoke: layouts serve favicon links; header logo visible light + dark
- [ ] Smoke: `/lyrics/*.emusic` reachable; optional local `.mp3` seeds if still used
- [ ] Confirm `web-ifc/` WASM still present after any public sync (Next-only;
      do not wipe when re-running robocopy from legacy)
- [ ] Spec / CUTOVER note that static parity is done; parent `frontend/` deletion
      is a **separate** approved step
- [ ] **Only then** remove or archive parent `frontend/public` (and eventually
      the legacy frontend tree)

### Re-sync command (Windows)

From repo root (does **not** delete Next-only extras such as `web-ifc/`):

```powershell
robocopy frontend\public eduardoos-next\frontend\public /E /XO /FFT /R:1 /W:1
```

Robocopy exit codes 0–7 are success; treat ≥8 as failure.

---

## Out of scope this document

- Deleting parent `frontend/` or `cmd/eduardoos`
- Replacing Next inline playlist icons with public SVG `<img>` tags
- Migrating S3 media libraries or Dynamo playlist rows
