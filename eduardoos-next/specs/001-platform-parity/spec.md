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

- **Visitor:** home, contact/assistant, public media where applicable.
- **Signed-in user:** pamphlets (epams), playlists, articles, BIM, subscriptions, profile.
- **APS admin** (`eduardooost@gmail.com`): Design Automation trigger + hub/registry explorer.

## Must-have capabilities (parity checklist)

### Auth
- Register, login, OTP verify, logout
- Password reset by email
- JWT sessions compatible with existing hash scheme (`sha256:` prefix as today) OR documented migration

### Content & tools
- Home (brand + assistant gate)
- Contact
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
  - Shared helper: `openApiErrorModal` / `ServerErrorModal` under `frontend/src/components/ServerErrorModal/`.
  - Operators must be able to copy the block to clipboard in one click.

### Frontend design (BIM / AEC)
- Agent skills (mandatory when building or restyling UI):
  - `.cursor/skills/frontend-design/SKILL.md` — distinctive craft; avoid AI-default palettes.
  - `.cursor/skills/bim-aec-frontend/SKILL.md` — blueprint vernacular for AEC tools on this site.
- Visual signature: cool drafting paper + steel / blueprint blue accent (light and dark). No purple-SaaS, cream/terracotta, or broadsheet defaults unless a feature brief overrides.
- Theme tokens live in `frontend/src/styles/theme.css` (`--site-*`). Plain CSS only.
- Theme persistence: `localStorage` key `eduardoos-theme`; apply via `html[data-theme="light"|"dark"]` and `html.dark`. Bootstrapped inline in `BaseLayout` and `PamphletLayout`; helpers in `frontend/src/lib/theme.ts`.
- Global menu **Theme** control in `Header` toggles light/dark on every layout (including pamphlet).

### Frontend chrome (site Header)
- **Desktop (≥768px):** fixed **left rail** (`--header_width: 60px`). Top = favicon logo → home; near bottom = hamburger; bottom = avatar (when logged in) with account menu. Nav tray slides in **from the left**, starting after the rail.
- **Mobile:** horizontal top bar (`--header_height: 60px`). Left = favicon → home; right = avatar then menu. Tray opens from the left below the bar.
- Layout shells (`BaseLayout`, `PamphletLayout`) and `global.css` offset content with `--header_height` / `--header_width` so blueprint wash and full-bleed editors do not sit under the rail.
- Tray still hosts primary links, Services dropdown, Theme toggle, and logged-out auth links.

### Global Activity Bar (chrome)
- Eduardo OS exposes a **global Activity Bar**: fixed bottom chrome shared across product surfaces (at minimum Music and Pamphlet).
- Shared component: `frontend/src/components/ActivityBar/` (`ActivityBar.tsx` + `ActivityBar.css`). Surfaces adapt via props; do not fork chrome CSS per page.
- **Layouts**
  - **Multi-row** (Music pattern): top row = timeline / scrubber (or other continuous control); bottom row = icon control buttons; optional expandable tray for secondary settings (volume, speed, etc.).
  - **Single-row** (Pamphlet pattern): one row of icon buttons; optional expandable tray for overflow / labels. No text-primary toolbar buttons in the bar — icons + `title` / `aria-label` only.
- Tokens: `--site-*` from `theme.css`; plain CSS; light/dark first-class; `prefers-reduced-motion` respected.
- **Activity bar icons MUST follow light/dark theme tokens and remain legible in both modes.** Use `currentColor` (or `--site-body-fg` on default buttons / `--site-accent-fg` on accent / pressed / primary fills). Do **not** hardcode white or light-gray strokes/fills that disappear on light backgrounds, or black strokes that disappear on dark/accent fills. Prefer inline SVG with `fill`/`stroke="currentColor"` over masked public assets that bake a single theme color.
- Pamphlet tools live in this bar (open / create / save / print / view mode / series when a pamphlet is open), not a separate corner FAB + text sidebar.

### Series → chapters → pamphlet tree
- Pamphlets (EPAMs) organize as **series → chapters → article/pamphlet**.
- Metadata already on Dynamo `eduardoos_epams`: `series`, `seriesChapter` (plus title/author); body JSON header uses `series` / `series_chapter`.
- Gateway: authenticated `GET /api/epams/series-tree` returns the grouped tree for the signed-in user (derived from list metadata — no new Dynamo table).
- When a pamphlet session is open, the Activity Bar exposes a **Series** control that opens a modal to view the tree and define/update the current pamphlet’s series + chapter (persists meta + document header).
- Articles UI may consume the same tree later; v1 wires pamphlets end-to-end.

## Success criteria

- [ ] Each must-have has tasks with tests-first implementation notes
- [ ] Backend can list/get user + epam against real or local-compatible stores
- [ ] Frontend shells for routes exist and call next APIs
- [ ] APS explorer shows bundles/activities and hub projects/items for admin
- [ ] `CUTOVER.md` gates still all unchecked until explicitly approved

## Out of scope until later specs

- Pixel-perfect pamphlet PDF parity polish beyond “usable”
- Full observability UI clone (logger/tester) — may follow as `002-observability`
