# Tasks — 001 Platform parity

Status: **partial** (see Remaining for parity). Cutover **T099** stays blocked.

## Phase P0 — Scaffold

- [x] T001 Create `eduardoos-next` tree + README + CUTOVER isolation rules
- [x] T002 Constitution + feature.json + parity spec/plan/data-contracts
- [x] T003 Backend Go module with `/health` handler + unit test
- [x] T004 Frontend Astro app with home shell + theme stubs
- [x] T005 `revitapi/README.md` describing APS bundle home

## Phase P1 — Auth

- [ ] T010 Spec clarify: OTP/SMTP env parity with production
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
- [ ] T041 Pamphlet generator mount (JSON EPAM shell only today — not full generator)
- [x] T042 Music, articles, edebat, subscribe, OpenBIM pages (stubs + playlist list/create)

## Phase P5 — Staging only

- [ ] T050 Next-only deploy scripts (must not alter parent `deploy.yml`)
- [ ] T051 Staging smoke checklist execution

## Cutover (blocked)

- [ ] T099 Execute `CUTOVER.md` only after explicit human approval

## Remaining for parity

Honest gaps vs production / full product surface:

- **Pamphlet generator** — full visual editor, layout tools, and raw PDF byte-stream generator (current Next UI is EPAM JSON list/create/edit only).
- **That Open / OpenBIM 3D viewer** — IFC list/create/download works with memory placeholders; no That Open / web-ifc viewer yet; Dynamo/S3 file bytes not fully wired.
- **Playlists** — GET/POST list + create-by-name only; no track library, drag-and-drop builder, player, or Dynamo `eduardoos_playlists` persistence.
- **Payments / PayPal** — subscription page chrome only; no hosted button, intents, webhook, or entitlement checks.
- **Edebat AI** — product stub/gate only; no debate rooms, turns, or AI transcript APIs.
- **Auth OTP/SMTP** — memory/Dynamo auth routes exist; production SMTP OTP parity still needs T010 + real mail config validation.
- **Articles / Homescool / gallery** — IA stubs, not full content pipelines.
- **Staging + cutover** — T050/T051 and T099 remain open; do not touch parent deploy until approved.
