# Eduardo OS Next

Greenfield rewrite of Eduardo OS. **Production cutover complete (2026-08-16):**
`https://eduardoos.com` serves this tree (nginx `:443` + API `:3000`). Staging remains on `:8080` / `:3001`.

| Folder | Role |
|--------|------|
| `frontend/` | Astro + React (plain CSS) ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ production HTML root |
| `backend/` | Go API (chi) ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ production host binary on `:3000` |
| `revitapi/` | Autodesk APS / Revit Design Automation assets |
| `.specify/` | Spec Kit constitution + process |
| `specs/` | Feature specs ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ plan ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ tasks (spec-driven development) |
| `deploy/` | Staging + production remote scripts (`deploy-remote-*.sh`) |
| `CUTOVER.md` | Cutover record, day-one gaps, rollback |
| `STATIC_MIGRATION.md` | Inventory + checklist: legacy `frontend/public` Ã¢ÂÂ Next `public/` (before deleting old tree) |

## Rules

1. Keep DynamoDB table names / S3 contracts stable (see `specs/001-platform-parity/`).
2. Do not rotate `JWT_SECRET` without a coordinated session invalidation plan.
3. Keep legacy parent `frontend/` and `cmd/eduardoos` in git for one-cycle rollback (`bin/eduardoos.prev` on host).
4. Development order: **spec ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ tests ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ code ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ converge**.

## Local quick start

See **[LOCAL.md](./LOCAL.md)** for the full runbook (backend `:3001` + frontend `:4322`).

```bash
# Backend
cd backend && go test ./... && go run ./cmd/server

# Frontend (dev proxy: /api and /health ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ :3001)
cd frontend && npm install && npm run dev
# ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ http://127.0.0.1:4322
```

## Frontend scaffolding (current)

Usable UI shell with production IA:

- **Libs**: `src/config/routes.ts`, `src/lib/api.ts`, `src/lib/auth.ts` (token key `eduardoos-next-auth-token`), `src/lib/validation.ts`, `src/lib/theme.ts` (`eduardoos-theme` light/dark), `epams` / `playlists` / `bim` clients
- **Chrome**: Header (Home, Contact, OpenBIM, APS, Services dropdown, **Theme** light/dark toggle; signed-in **avatar** in the bar/rail ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ photo from GET /api/auth/profile -> profileImageUrl / /api/media/file/profiles/..., letter initial fallback on miss/error), AuthGate, BaseLayout / PamphletLayout
- **Design**: gallery-atelier / muted steel tokens in `src/styles/theme.css` (Cormorant Garamond brand + Montserrat / Raleway / Roboto); agent skills `.cursor/skills/frontend-design`, `.cursor/skills/bim-aec-frontend`, `.cursor/skills/elegant-formal-ui`, and `.cursor/skills/agent-voice` (also in `specs/001-platform-parity/spec.md`). Activity bar icons use `currentColor` / `--site-body-fg` / `--site-accent-fg` (legible in light and dark).
- **Activity Bar**: shared `frontend/src/components/ActivityBar/` (multi-row Music bottom transport). **Header Dynamic Menu**: `frontend/src/components/HeaderDynamicMenu/` (Pamphlet tools inside Header rail / mobile center slot; not a second top bar); series tree `GET /api/epams/series-tree`
- **Auth**: login / register (Contact-style not-a-bot hold + notABot / spammy local-part reject) / verify-otp / reset-password forms
- **Contact**: `/contact` channel buttons (Email, WhatsApp, Through AI agent → bot gate + chat via `startChatAfterBotCheck` / `eduardoos:contact-start-agent`); `ContactAgent` also docks on home desktop. Agents disclose AI role and never impersonate Eduardo (`src/lib/agentVoice.ts`; LLM prompt in `backend/internal/contact/identity.go`). Replies match the visitor’s latest-message language (no Spanish default for English). Public ask APIs: `POST /api/contact/ask` and `POST /api/profile/ask` (anti-bot `humanToken`, DeepSeek when `DEEPSEEK_API_KEY` set; no JWT). Assistant bubbles render safe Markdown via `src/lib/markdown.ts` + shared `ChatMarkdown` (home, contact, Instrumentalist); check `npm run test:markdown`.
- **Admin users**: `/admin/users` (platform admin eduardooost@gmail.com only — JWT + IsAdminEmail on `/api/admin/*`). Access|Subscriptions editor + delete with confirm. Delete/entitlements resolve email via `?email=` (preferred) or URL-decoded path `{email}` so spam accounts with many dots (e.g. `b.ero…@gmail.com`) can be removed; register-only `IsSpammyLocalPart` is not applied. Static HTML published atomically. API failures use ServerErrorModal / openApiErrorModal.
- **Service entitlements**: `ServiceGate` + `GET /api/subscriptions/access/{serviceID}` grant **full access to platform admins** (`role === admin` or bootstrap email `eduardooost@gmail.com`) for Homescool, Debate, Pamphlet, Videos, Instrumentalist, etc. JWT includes `role`; payments handler resolves admin via user store. **Homescool students** (any teacher→student link) may use hub + `/homescool/learning` without a paid entitlement; **teacher** routes/UI still require an active `homescool` subscription (or admin). Check: `go test ./internal/payments/... ./internal/homescool/...` and `npm run test:service-access`.
- **APS admin**: workitem trigger + registry panel + hub explorer. Registry lists are normalized to arrays (`ExtractDataList` / `normalizeRegistryLists`) so Fetch registry cannot blank the React tree; render guards + `ServerErrorModal` keep chrome visible. Check: `node --test src/lib/apsRegistry.test.mjs` in `frontend/`.
- **Wired**: pamphlet visual generator (`src/lib/pamphlet-generator`, mount on `/documents/pamphlet` with cloud EPAMs via `/api/epams`; Print downloads full Roboto landscape PDF via `POST /api/documents/pamphlet/pdf`), **Music** worship builder (`PlaylistBuilder` + `/api/media/audio` + admin-only `POST /api/media/audio/upload` mic recorder → S3 `worship_playlists` → session playlist + `/api/emusic` lyric shell; lyric structure editor with `--site-*` theme + multi-select bulk delete for APS admin), subscription intents + PayPal hosted button placeholder, OpenBIM upload/list/download + **That Open / web-ifc 3D viewer** on `/bim` (memory; optional `IFCBIM_S3_BUCKET`; WASM at `/web-ifc/`; Fragments camera-update sync so geometry appears after fit), edebat list/create/turn (memory), **The Instrumentalist** (`/instrumentalist`: chat + topic by default; Beliefs header-menu toggle for `@xyflow/react` tree; single default `.instru` upsert; JWT `/api/instrumentalist*`; DeepSeek analyze/chat when `DEEPSEEK_API_KEY` set; belief canvas uses `deleteKeyCode={null}` + canvas-scoped Backspace/Delete so toolbar/input focus cannot wipe selected ideas), **Homescool** (`/homescool`: register students, teacher roster/workspace, student `/homescool/learning`; JWT `/api/homescool/*`; durable DynamoDB links + task templates/assignments in `eduardoos_catalog`; S3 `homeschool/{teacher}/{student}/…` + submissions; teacher catalogs = Period + Study area only; task duration = fixed Spanish presets stored as `durationMin` (`30m`/`1h`/`2d`/`1w`/`3mo`…); four teacher boards stacked full-width + student pending board; folders header toggle = sidebar-rail icon; aside symmetric padding; grade 1–5 segment bar; atelier-styled HTML emails via shared `SMTP_USER`/`SMTP_PASS` for register / assign / grade; checks `go test ./internal/homescool/...`, `npm run test:homescool`), **Greek** (admin-only `/greek` + `/greek/build` + `/greek/build/{grupo}`; JWT `/api/greek/*`; DynamoDB group catalog + S3 `greek/{user}/{group}/chapters/…/verses/…/words/…/letters/{i}.svg` 32×64; canvas letter draw; bilingual glosses + ordinals n/1000 chapter and n/10000 book; IAM prefixes in `deploy/aws/ec2-iam-s3-policy.json`; checks `go test ./internal/greek/...`, `npm run test:greek`)
- **Stubs**: articles, gallery
- **Profile**: /auth/profile upload form -> POST /api/auth/profile/image; header reads GET /api/auth/profile (S3 key under media/profiles/{email}/)
- **Deferred (accepted day-one gaps)**: PayPal IPN + Dynamo payments/entitlements; edebat LLM referee / S3 persistence

`npm run build` must stay green for frontend changes.

## Deploy / cutover

- **Production**: parent `.github/workflows/deploy.yml` ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ `deploy/ec2/deploy-remote.sh` ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ `eduardoos-next/deploy/deploy-remote-production.sh`
- **Staging**: `.github/workflows/deploy-next-staging.yml` ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ `deploy-remote-staging.sh`
- Details + rollback: **[CUTOVER.md](./CUTOVER.md)**
