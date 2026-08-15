# Tasks â€” 001 Platform parity

## Phase P0 â€” Scaffold

- [x] T001 Create `eduardoos-next` tree + README + CUTOVER isolation rules
- [x] T002 Constitution + feature.json + parity spec/plan/data-contracts
- [x] T003 Backend Go module with `/health` handler + unit test
- [x] T004 Frontend Astro app with home shell + theme stubs
- [x] T005 `revitapi/README.md` describing APS bundle home

## Phase P1 â€” Auth

- [ ] T010 Spec clarify: OTP/SMTP env parity with production
- [x] T011 Tests for password hash verify (`sha256:`)
- [x] T012 Implement auth store adapter (Dynamo/memory)
- [x] T013 Login/register/verify-otp/reset-password routes + tests
- [x] T014 Frontend auth pages wired to next API

## Phase P2 â€” Content APIs

- [x] T020 Epams list/get/save against `eduardoos_epams` + S3 keys
- [x] T021 Playlists CRUD contract tests + handlers
- [x] T022 IFC BIM list/upload/file against `eduardoos_ifcbim` + `ifcbim/`

## Phase P3 â€” APS explorer

- [ ] T030 Spec for hub + DA registry UI (acceptance criteria)
- [x] T031 Backend: list appbundles, activities, engines
- [x] T032 Backend: list hubs â†’ projects â†’ folder contents
- [x] T033 Frontend APS panel (admin-gated) consuming those APIs
- [x] T034 Preserve workitem trigger/poll

## Phase P4 â€” Product UI

- [x] T040 Home + contact assistant
- [ ] T041 Pamphlet generator mount
- [x] T042 Music, articles, edebat, subscribe, OpenBIM pages (stubs)

## Phase P5 â€” Staging only

- [ ] T050 Next-only deploy scripts (must not alter parent `deploy.yml`)
- [ ] T051 Staging smoke checklist execution

## Cutover (blocked)

- [ ] T099 Execute `CUTOVER.md` only after explicit human approval

