# Tasks — 001 Platform parity

Status: **partial** (see Remaining for parity). Cutover **T099** stays blocked.

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
- [x] T033 Frontend APS panel (admin-gated) consuming those APIs
- [x] T034 Preserve workitem trigger/poll

## Phase P4 — Product UI

- [x] T040 Home + contact assistant
- [x] T041 Pamphlet generator mount (`eduardoos-next/frontend/src/lib/pamphlet-generator` + PamphletLayout; cloud open/save via `/api/epams`). PDF print route still pending documents service.
- [x] T042 Music, articles, edebat, subscribe, OpenBIM pages (stubs + playlist list/create)

## Phase P5 — Staging only

- [x] T050 Next-only deploy scripts (must not alter parent `deploy.yml`)
- [x] T051 Staging smoke checklist execution

## Cutover (blocked)

- [ ] T099 Execute `CUTOVER.md` only after explicit human approval

## Remaining for parity

Honest gaps vs production / full product surface:

- **Pamphlet PDF print** — visual editor + EPAM cloud toolbar are mounted; `/api/documents/pamphlet/pdf` not yet in Next backend.
- **That Open / OpenBIM 3D viewer** — multipart upload stores real IFC bytes in memory (GET returns them); optional S3 when `IFCBIM_S3_BUCKET`/`S3_BUCKET` + AWS creds; no That Open / web-ifc / three viewer yet (deferred for build memory).
- **Playlists** — GET/POST list + create-by-name only; no track library, drag-and-drop builder, player, or Dynamo `eduardoos_playlists` persistence.
- **Payments / PayPal** — subscription page chrome only; no hosted button, intents, webhook, or entitlement checks.
- **Edebat AI** — product stub/gate only; no debate rooms, turns, or AI transcript APIs.
- **Auth OTP/SMTP** - SMTP_USER/SMTP_PASS + DEV_RETURN_OTP wired (T010); empty SMTP_PASS logs OTP; real Gmail delivery needs SMTP_PASS set on host.
- **Articles / Homescool / gallery** — IA stubs, not full content pipelines.
- **Staging + cutover** - T050/T051 next-only scripts + smoke checklist under `eduardoos-next/deploy/`; T099 remains blocked until explicit approval.
