# Milestone: Pamphlet Editor + Playlist Offline/Auto-Advance — 2026-06-29

## Status: SHIPPED on `master` (production deploy verified)

| Commit | Message |
|--------|---------|
| `b522597` | fix: EC2 deploy disk exhaustion during Docker builds |
| `053f515` | fix: playlist auto-advance and bulk offline library download |
| `3f6da9c` | fix: pamphlet flex row-gap spacing and always-on console logging |
| `63ab9aa` | fix: pamphlet spacing after delete, insert paragraph, and trace logging |
| `f7e7f47` | fix: pamphlet desktop gap, delete layout, and mobile toolbar anchor |
| `e1cc6a4` | fix: anchor block toolbar to selection and restyle activity buttons |
| `1dd42d9` | fix: desktop pamphlet sheet layout and toolbar placement |
| `d2d6b78` | fix: pamphlet mobile column cards, edit mode, and verbose trace logging |
| `1d7efb2` | fix: pamphlet mobile column stream, edit mode, and dev proxy |
| `d3425a5` | fix: pamphlet editor edit mode, image delete, and hydration |

**Deploy:** CI/CD run `28368734162` succeeded after `b522597`. Earlier failures (`28368103802`, `28305800735`) were EC2 **disk full** during Docker `go test` — not application test failures.

---

## 1. Pamphlet editor (`/documents/pamphlet`)

### Shipped
- Full edit mode: paragraphs, headings, lists, quotes, image captions; toolbar anchored above selection (desktop + mobile)
- Mobile/tablet: column stream as cards; print source hidden except `@media print`
- Desktop: 8px header-to-preview gap; sheet scale reset after delete
- Paragraph spacing via flex `row-gap` + `--para-sep-mm` (survives global `* { margin: 0 }`)
- `insert_below` creates visible paragraph + `newRef`; auto-edit on new block
- Verbose client logging: `CLICK`, `STATE`, `RESULT`, `spacing_audit_*` (always `console.log`)
- Backend: sheet CSS vars, mutation `newRef`, pamphlet tests

### Debug (browser)
```js
localStorage.setItem('eduardoos-pamphlet-debug', 'verbose')
```

---

## 2. Worship playlist (`/media/playlist`)

### Shipped (this milestone)
- **Auto-advance:** next track plays when current ends (ignore pause-on-ended, `autoPlayNextRef`, `canplay` wait)
- **Offline PWA:** `saveTracksOfflineBulk()` in IndexedDB via localforage
- Toolbar **Save library offline (X/Y)** with progress
- Playback prefers cached blob URLs; background cache when online
- Tests: `frontend/src/lib/offlineAudio.test.ts`

### Prior work (see `MILESTONE-worship-playlist-20260627.md`, `MILESTONE-mobile-ux-playback-20260627.md`)
- S3 library, DynamoDB playlists, mobile mixer tray, Unicode path encoding, 1.5× mobile UI scale

---

## 3. Deploy / infra

- Removed redundant `go test ./...` from `docker/golang-service.Dockerfile` (CI already tests)
- `deploy/ec2/deploy-remote.sh`: `reclaim_ec2_disk()` + `docker builder prune` between service builds
- Local dev: `npm install` in `frontend/` required for `tsconfig.json` / `@types/react` IDE resolution

---

## Deferred (not in this milestone)

- Pamphlet: crossfade, public share URLs, collaborative editing
- Playlist: per-playlist offline (only full library bulk today), crossfade, waveforms
- EC2: larger EBS volume if deploy disk pressure returns

## Next up

Per `PLAN-pamphlet-document-generator.md` — any remaining pamphlet generator backend/PDF parity items not yet ported from `document_generator/`.
