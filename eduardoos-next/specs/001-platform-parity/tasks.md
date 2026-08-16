# Tasks — 001 Platform parity

Status: **partial** (see Remaining for parity). Cutover **T099** executed 2026-08-16 (human-approved; day-one gaps accepted).

## Phase P0 — Scaffold

- [x] T001 Create `eduardoos-next` tree + README + CUTOVER isolation rules
- [x] T002 Constitution + feature.json + parity spec/plan/data-contracts
- [x] T003 Backend Go module with `/health` handler + unit test
- [x] T004 Frontend Astro app with home shell + theme stubs
- [x] T005 `revitapi/README.md` describing APS bundle home

## Phase P1 — Auth

- [x] T010 Spec clarify: OTP/SMTP env parity with production
- [x] T011 Tests for password hash verify (`sha256:`)
- [x] T012 Implement auth store adapter (Dynamo/memory)
- [x] T013 Login/register/verify-otp/reset-password routes + tests
- [x] T014 Frontend auth pages wired to next API

## Phase P2 — Content APIs

- [x] T020 Epams list/get/save against `eduardoos_epams` + S3 keys
- [x] T021 Playlists CRUD contract tests + handlers
- [x] T022 IFC BIM list/upload/file against `eduardoos_ifcbim` + `ifcbim/`

## Phase P3 — APS explorer

- [ ] T030 Spec for hub + DA registry UI (acceptance criteria)
- [x] T031 Backend: list appbundles, activities, engines
- [x] T032 Backend: list hubs → projects → folder contents
- [x] T033 Frontend APS panel (admin-gated) consuming those APIs — access check must never hang on “Checking access…”; API failures use ServerErrorModal (copyable).
- [x] T034 Preserve workitem trigger/poll

## Phase P4 — Product UI

- [x] T040 Home + contact assistant
- [x] T041 Pamphlet generator mount (`eduardoos-next/frontend/src/lib/pamphlet-generator` + PamphletLayout; cloud open/save via `/api/epams`). Stub PDF via `POST /api/documents/pamphlet/pdf`.
- [x] T042 Music, articles, edebat, subscribe, OpenBIM pages (playlist + subscription + edebat list/create/turn wired; articles/homescool still stubs)

## Phase P5 — Staging only

- [x] T050 Next-only deploy scripts (must not alter parent `deploy.yml`)
- [x] T051 Staging smoke checklist execution

## Cutover

- [x] T099 Execute `CUTOVER.md` after explicit human approval (2026-08-16). Production `deploy.yml` + nginx `:443` + API `:3000` serve Eduardo OS Next. Staging `:8080`/`:3001` kept. JWT_SECRET unchanged. Rollback: `bin/eduardoos.prev` + remount `./frontend/dist`. Accepted day-one gaps: stub PDF, no That Open viewer, playlists/payments/edebat partial (see `CUTOVER.md`).

## Remaining for parity

Honest gaps vs full product surface (accepted at cutover; track post-cutover):

- **Pamphlet PDF print** — stub single-page PDF from Next `pkg/pdf.BuildSamplePDF` (Print button works); full landscape Roboto layout parity still deferred.
- ~~**That Open / OpenBIM 3D viewer**~~ — done: `/bim` `IfcViewer` island (`@thatopen/components`, fragments, `web-ifc`, three); bytes from `GET /api/bim/models/:id/file`; WASM via `public/web-ifc/` (postinstall/prebuild copy).
- **Playlists / Music** — worship `PlaylistBuilder` on `/media/musica` (library + lyrics + admin lyric editor via `/api/media/audio`, `/api/media/file/*`, `/api/emusic`); legacy memory playlist CRUD still mounted but not primary UI.
- **Payments / PayPal** — JWT `POST /api/payments/intents`, public `GET /api/payments/status/{id}`, entitlements list/preview (memory store); subscription UI prepares intent + hosted button via `PAYPAL_HOSTED_BUTTON_ID`. No PayPal IPN webhook, Dynamo `eduardoos_payments`, or real entitlement grants after checkout.
- **Edebat AI** — JWT memory list/create + turn (role+text) wired; no LLM referee, surrender/KO, Dynamo, or S3 `.edebat` bodies.
- **Auth OTP/SMTP** — SMTP_USER/SMTP_PASS + DEV_RETURN_OTP wired (T010); production/staging strip spaces in SMTP_PASS for Gmail.
- **Articles / Homescool / gallery** — IA stubs, not full content pipelines.
- **Staging** — remains secondary on `:8080` / `:3001` after production cutover.
