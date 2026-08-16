# Feature 001 — Platform parity (greenfield)

## Status

Specified — implementation proceeds task-by-task under this folder.

## Problem

Production Eduardo OS works but the monorepo is hard to evolve. We need a clean rewrite that can eventually replace production **without losing S3/DynamoDB data** and without breaking live deploy while we build.

## Goals

1. Ship a self-contained app under `eduardoos-next/` (`frontend`, `backend`, `revitapi`).
2. Match must-have product capabilities listed below.
3. Speak the **same data contracts** as production (see `data-contracts.md`).
4. Keep production deploy on the old tree until cutover checklist passes.

## Non-goals (this feature)

- Editing or deleting the parent production codebase.
- Changing live nginx/`deploy.yml` targets.
- Inventing new DynamoDB table names for existing domains.

## Users

- **Visitor:** home, contact/AI agent, public media where applicable.
- **Signed-in user:** pamphlets (epams), playlists, articles, BIM, subscriptions, profile.
- **APS admin** (`eduardooost@gmail.com`): Design Automation trigger + hub/registry explorer.

## Must-have capabilities (parity checklist)

### Auth
- Register, login, OTP verify, logout
- Password reset by email
- JWT sessions compatible with existing hash scheme (`sha256:` prefix as today) OR documented migration

### Content & tools
- Home (brand + AI agent gate; agent never impersonates Eduardo)
- Contact (channels + AI agent; same identity rules)
- Pamphlet editor (open/create local `.epam` + cloud epams)
- Music / playlists
- Articles
- OpenBIM (IFC upload/list/download + That Open / web-ifc 3D viewer on `/bim`; storage `ifcbim/` + `eduardoos_ifcbim`)
- Edebat
- Subscribe / entitlements
- APS admin: work item trigger + **panel listing registered DA assets and hub items**

### Platform
- Gateway health
- Correlation ID on API calls
- Static frontend served behind nginx (cutover-time)
- **Server error UX (mandatory):** every failed server/API response that the UI surfaces to a user MUST open a modal with:
  1. a short human summary, and
  2. a **copyable** monospaced block containing the full diagnostic (`HTTP` status, message, `correlation_id`, path/method, and relevant body excerpt).
  - Do **not** rely only on `console.error`, silent toasts, or a status line that disappears.
  - Do **not** leave operators on a blank nginx error page for app routes that should be static HTML (e.g. `/admin/users`); static must build + publish atomically and nginx must fall back via `try_files` without redirect cycles.
  - Shared helper: `openApiErrorModal` / `ServerErrorModal` under `frontend/src/components/ServerErrorModal/`.
  - **Admin Users (`/admin/users`)** is in scope: list/load, entitlement save, and **user delete** failures MUST call `openApiErrorModal`; access gate must not hang on “Checking access…”. API errors return JSON (never panic); the UI maps them into the modal — never silent failure. Delete uses an accessible confirm dialog; cannot delete self / platform admin. Entitlements editor shows **Access** (effective, read-only; admin = all on) | **Subscriptions** (editable grants). Register requires Contact-style bot hold + server rejects spammy dotted local-parts / missing `notABot`.
  - Operators must be able to copy the block to clipboard in one click.

### Frontend design (BIM / AEC + elegant formal)
- Agent skills (mandatory when building or restyling UI):
  - `.cursor/skills/frontend-design/SKILL.md` — distinctive craft; avoid AI-default palettes.
  - `.cursor/skills/bim-aec-frontend/SKILL.md` — blueprint vernacular for AEC tools on this site.
  - `.cursor/skills/elegant-formal-ui/SKILL.md` — elevate chrome/home/contact toward elegant, formal, stylized gallery-atelier (not hacker-grid dashboard).
- Visual signature: cool limestone / evening ink + muted steel accent; whispered blueprint cues; brand-first home. No purple-SaaS, cream/terracotta, broadsheet, or neon drafting-grid defaults unless a feature brief overrides.
- Typography: Cormorant Garamond (brand/display, restrained) + Montserrat (UI) + Raleway (body) + Roboto (utility), loaded in `BaseLayout` / `PamphletLayout`.
- Theme tokens live in `frontend/src/styles/theme.css` (`--site-*`). Plain CSS only.
- Theme persistence: `localStorage` key `eduardoos-theme`; apply via `html[data-theme="light"|"dark"]` and `html.dark`. Bootstrapped inline in `BaseLayout` and `PamphletLayout`; helpers in `frontend/src/lib/theme.ts`.
- Global menu **Theme** control in `Header` toggles light/dark on every layout (including pamphlet).

### Visitor AI agents (identity + voice)
- Every visitor-facing chat agent (home dock, contact, profile/skill Q&A via `profile_qa`) **is an AI agent**, never Eduardo or the site owner.
- Do not speak in first person as Eduardo; refer to him in the third person; disclose the AI/agent role when relevant.
- Voice: **professional, relaxed, concrete, didactic** (see `.cursor/skills/agent-voice/SKILL.md`).
- System prompt source of truth (production chatbot): `pkg/contact/agent_identity.go` (`ProfileQASystemPrompt`). Frontend welcome copy: `frontend/src/lib/agentVoice.ts` (eduardoos-next).
- Routes: `/api/profile/ask` (home), `/api/contact/ask` (contact) — both use chatbot role `profile_qa`.

### Frontend chrome (site Header)
- **Desktop (≥768px):** fixed **left rail** (`--header_width: 60px`). Top → bottom: favicon logo → home; hamburger menu; avatar (when logged in) with account menu; when a route registers tools, a **separator** then the **Header Dynamic Menu** section (stacked tool buttons, `overflow-y: auto` if needed). Nav tray slides in **from the left**, starting after the rail.
- **Mobile:** horizontal top bar (`--header_height: 60px`). Left = favicon → home; **center = Header Dynamic Menu** (when registered; `overflow-x: auto` if buttons do not fit); right = avatar then menu. Tray opens from the left below the bar.
- Layout shells (`BaseLayout`, `PamphletLayout`) and `global.css` offset content with `--header_height` / `--header_width` so blueprint wash and full-bleed editors do not sit under the rail. Do **not** reserve a second full-width top toolbar over main content.
- Tray still hosts primary links, Services dropdown, Theme toggle, and logged-out auth links.
- **Header Dynamic Menu** (optional per-route): a **section inside Header chrome**, not a separate bar over the page. Host: `frontend/src/components/HeaderDynamicMenu/` (`#header-dynamic-menu-host` inside `Header`). Empty host is hidden; a route mounts its tool buttons into the host. **Desktop:** after avatar + separator in the left rail (vertical stack). **Mobile:** center slot between logo and avatar/menu (horizontal row, `overflow-x: auto`). Used by **Pamphlet** (`/documents/pamphlet`). Music does **not** register tools here. Tokens / icons: `--site-*` + `currentColor` (legible light/dark).

### Global Activity Bar (chrome)
- Eduardo OS exposes a **global Activity Bar**: fixed **bottom** chrome for product surfaces that need dense multi-control transport.
- Shared component: `frontend/src/components/ActivityBar/` (`ActivityBar.tsx` + `ActivityBar.css`). Surfaces adapt via props; do not fork chrome CSS per page.
- **Layouts**
  - **Multi-row** (Music pattern): top row = timeline / scrubber (or other continuous control); bottom row = icon control buttons; optional expandable tray for secondary settings (volume, speed, etc.). **Music continues to use this bottom Activity Bar** (multi-row OK); do not move Music tools into Header Dynamic Menu.
  - **Single-row**: one row of icon buttons; optional expandable tray for overflow / labels. Icons + `title` / `aria-label` only (no text-primary toolbar buttons in the bar).
- Tokens: `--site-*` from `theme.css`; plain CSS; light/dark first-class; `prefers-reduced-motion` respected.
- **Activity bar icons MUST follow light/dark theme tokens and remain legible in both modes.** Use `currentColor` (or `--site-body-fg` on default buttons / `--site-accent-fg` on accent / pressed / primary fills). Do **not** hardcode white or light-gray strokes/fills that disappear on light backgrounds, or black strokes that disappear on dark/accent fills. Prefer inline SVG with `fill`/`stroke="currentColor"` over masked public assets that bake a single theme color.
- **Pamphlet** does **not** use the bottom Activity Bar. Pamphlet tools (open / create / save / print / view mode / series when a pamphlet is open) live in the **Header Dynamic Menu** section inside Header chrome.
### Series → chapters → pamphlet tree
- Pamphlets (EPAMs) organize as **series → chapters → article/pamphlet**.
- Metadata already on Dynamo `eduardoos_epams`: `series`, `seriesChapter` (plus title/author); body JSON header uses `series` / `series_chapter`.
- Gateway: authenticated `GET /api/epams/series-tree` returns the grouped tree for the signed-in user (derived from list metadata — no new Dynamo table).
- When a pamphlet session is open, the Header Dynamic Menu exposes a **Series** control that opens a modal to view the tree and define/update the current pamphlet’s series + chapter (persists meta + document header).
- Articles UI may consume the same tree later; v1 wires pamphlets end-to-end.

## Success criteria

- [ ] Each must-have has tasks with tests-first implementation notes
- [ ] Backend can list/get user + epam against real or local-compatible stores
- [ ] Frontend shells for routes exist and call next APIs
- [ ] APS explorer shows bundles/activities and hub projects/items for admin
- [ ] `CUTOVER.md` gates still all unchecked until explicitly approved

## Static assets (legacy public → Next)

See **[`STATIC_MIGRATION.md`](../../STATIC_MIGRATION.md)**. As of 2026-08-16, all
37 files under parent `frontend/public/**` are mirrored (identical hashes) into
`eduardoos-next/frontend/public/**`, including the full favicon set used by the
header logo and layouts. Next also keeps `public/web-ifc/*.wasm` (OpenBIM). Do
**not** delete the legacy frontend until that doc’s remaining smoke/deploy
checks are green.

## Out of scope until later specs

- Pixel-perfect pamphlet PDF parity polish beyond “usable”
- Full observability UI clone (logger/tester) — may follow as `002-observability`
