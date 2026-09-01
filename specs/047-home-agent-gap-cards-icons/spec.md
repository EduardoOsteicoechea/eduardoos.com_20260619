# Feature 047 — Home agent gap, Talk To Assistant, equal cards, flat sections, dashboard icons

## Status

**Done** (2026-09-01).

## Acceptance
- [x] Desktop: visible `--home-gap` between dossier and agent tray (no flush overlap)
- [x] Title **Talk To Assistant** on home + contact docks
- [x] Same-row cards equal height (home + product dashboards)
- [x] Experience + Skills sections: no section bg/padding
- [x] Icons on home section/job/skill/FAQ cards and all ProductDashboard cards
- [x] FE build + commit/push

## Problem

1. Desktop home: gap between dossier columns (col 1–2) and the fixed AI agent tray is missing or collapsed (flush look).
2. Agent chrome title still reads “AI agent”; must be **Talk To Assistant**.
3. Cards in the same grid row have uneven heights (Profile vs Specialization; job cards; skill cards; product dashboard cards).
4. Professional Experience and Skills and Stack feel identical to other surface blocks — need visual variation: **no section background, no section padding**; only heading/text + inner cards.
5. Home and product dashboard cards lack icons.

## Goals (locked)

### Home desktop gap (≥960px)
- Preserve 3-column shell: dossier spans columns 1–2; agent column 3; gutters = `--home-gap`.
- **Mandatory gutter** between dossier and agent tray: exactly `--home-gap`.
- **Sticky agent:** `.home-hero__chat` must be `position: sticky` with an appropriate `top` so it remains in view while the dossier scrolls. Never let a broader `position: relative` rule override sticky on desktop.
- Do **not** size columns with `100vw` (scrollbar eats the gutter).

### Agent heading
- Shared dock title (home + contact preset): **`Talk To Assistant`** (replace `"AI agent"`).
- `aria-label` on the home aside matches.

### Equal-height cards
- Any CSS grid of cards in one row uses **stretch** alignment; each card fills the row height (`height: 100%` / flex column).
- Applies to: Profile|Specialization row; Professional Experience job cards; Skills skill cards; FAQ cards; all `ProductDashboard` `DashboardGrid` cards.

### Flat sections (variation)
- **Professional Experience** and **Skills and Stack**: section wrapper has **no background** and **no padding** (flush to page body bg). Heading + lead text + inner cards only.
- Inner job/skill cards keep their own surface so they remain readable.
- Other dossier blocks (Profile, Specialization, Education, FAQ, Focus, Contact) keep current surface card treatment.

### Icons (Material Symbols)
- Every home dossier **section** `h2` has a leading icon.
- Every **job card**, **skill card**, and **FAQ card** has a leading icon.
- Every product **dashboard card** (`DashboardGrid`) has a required `icon` (Material Symbol name) shown with the title.
- Icons use `currentColor` / site tokens; light and dark legible.

## Non-goals
- Changing agent voice / non-impersonation copy (only chrome title).
- Redesigning Pamphlet/Scrib canvas geometry.
- Removing product dashboard card surfaces (only home Experience/Skills sections go flat).

## Affected paths
- `specs/047-home-agent-gap-cards-icons/spec.md`
- `specs/018-home-profile-scroll/spec.md`, `specs/021-unify-site-agent/spec.md`, `specs/046-…` (cross-refs)
- `frontend/src/styles/pages.css`
- `frontend/src/components/Home/**`, `lib/eduardoProfile.ts`, `lib/agentVoice.ts`
- `frontend/src/components/ProductDashboard/**`
- Product hubs: Music, eVoice, Pamphlet, Homescool, eReport, Church, Scrib (if using DashboardGrid)
