# Feature 046 — Unified gutters + product dashboards + eReport orgs/invites

## Status

**Ready** (2026-09-01) — open questions locked from user.

## Problem

1. Inconsistent outer margins/paddings across product routes (e.g. Homescool custom gutters).
2. Only Music / eVoice / Pamphlet use ProductDashboard cards; other product entry routes do not.
3. eReport needs **orgs** (not flat reports), magic-link invites (org list or single report), time-bounded edit, and tracker UX/style aligned with `reporte_qa_populado.html` via Eduardo OS tokens.

## Locked decisions

### Invites
1. **Magic link** — invitee opens without requiring a prior Eduardo OS account/login.
2. **Edit window:** single-report invite → **edit for 1 hour** from first open (or from grant — implement as 1 hour from token issuance unless modal overrides). Org-list invite → duration **chosen in the invite modal**; during that window invitee may **edit**.
3. **Org-list invite scope:** access to **all reports that exist in that org’s list** for the selected duration (reports under that org).
4. **Dashboards:** every product initial route gets ProductDashboard-style cards/sections; **each route defines its own section structure and card set**.
5. **Migration:** **no** migrate of legacy flat reports. eReport begins fresh with org dashboard. New reports only under orgs.

### eReport dashboard (initial)
Cards/sections:
- **Orgs** (list / open) — pick an org, then a **second card row** for that org:
  - **Edit org** — rename
  - **Reports** — create/import, list (open, per-report invite, **delete** after confirm)
  - **Invite** — org-list magic link (email + duration)
- **Register org**
- **Recent reports**
- **Manage orgs** (order, delete org, hide, rename, new, etc.)

**Orgs sub-cards (2026-09-03):** After selecting an org, do **not** dump edit + reports + invite forms in one scroll. Show three `DashboardGrid` cards (**Edit org**, **Reports**, **Invite**); each opens its panel. Back returns to the three cards (then Back to dashboard / HDS returns to hub).

**Delete report (2026-09-03):** From Orgs → Reports panel, each report has **Delete**. Confirm with `window.confirm` (clear copy naming the report). On success, remove from the org library UI and refresh. Shared/invite viewers cannot delete.

### Gutters
Canonical product page outer inset:
- Horizontal: `--page-inline-pad` (`--p2`)
- Top: `--p3`
- Bottom: `--p5`

**Exceptions (editing canvases):** Scrib sheet editor; Pamphlet non-dashboard editor; eReport report tracker/editor (edge-to-edge under site header). Dashboards/hubs **do** use base gutters.

### Home (same delivery wave — marketing)
- AI chat panel **always on top** (above scrolling dossier; fix stacking context).
- Profile info blocks: **two cards per row** (responsive; 1 col on narrow).
- Section titles **direct** (not “Who is Eduardo…?”): Profile, Specialization, Education and Training, Professional Experience, Skills & Stack, Focus, Contact, FAQ.
- Body copy **first person**, integrating enthusiasm for **AI-driven development**, facts still from CV / `PROFILE_CONTEXT.md` (no invention). FAQ JSON-LD may keep natural-language questions for AEO.

## Goals

1. Unify gutters on all non-exception routes; remove Homescool flush/0.85rem overrides.
2. Apply ProductDashboard pattern to Homescool, Church, Scrib hub, eReport, Articles (and keep Music/eVoice/Pamphlet); sectioned cards per product.
3. eReport: org CRUD + recent + manage; reports under org; magic invites (org list + single report) with email + link; tracker restyle to site tokens with populado UX.
4. Home chat/stacking + 2-col first-person dossier as above.

## Non-goals

- Migrating old flat `ereport/{user}/reports/…` into orgs.
- Changing Pamphlet/Scrib mm/px geometry.
- Agent impersonation: site **agent** stays third person; **marketing dossier** is first person as Eduardo.

## Acceptance

- [x] Gutters unified; Homescool uses site tokens
- [x] Product entry routes have sectioned ProductDashboard cards (Homescool, Church, Scrib hub, eReport; Music/eVoice/Pamphlet prior)
- [x] eReport org dashboard + magic invites (list duration modal; report = 1h edit) + tracker site-styled
- [x] Orgs → Reports: delete report after confirm (owner/admin)
- [x] Orgs → selected org: Edit org / Reports / Invite as cards (not one stacked form)
- [x] Home: chat on top; 2 cards/row; direct first-person sections with AI enthusiasm
- [x] Tests + FE build + commit/push

## Status

**Ready / shipped** (2026-09-01).

## Affected paths

- `specs/046-page-gutters-dashboards-ereport-clients/spec.md` (this file; “clients” ≡ **orgs**)
- `specs/018-home-profile-scroll/spec.md` (home dossier amendments)
- `frontend/src/styles/pages.css`, Homescool/Church/Scrib/eReport/Articles hubs
- `frontend/src/components/ProductDashboard/**`, `Home/**`, `lib/eduardoProfile.ts`
- `frontend/public/ereport-tracker.html`
- `backend/internal/ereport/**`
