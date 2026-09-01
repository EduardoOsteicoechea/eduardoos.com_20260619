# Feature 050 — Home FAQ lateral questions

## Status

**Done** (2026-09-01) — containment fix for broken multi-col flow.

## Problem

Home FAQ should match the dossier screenshot: each question with its icon on one horizontal row, answers underneath, items in a multi-column grid, and the contact FAQ using real Email / WhatsApp / LinkedIn links (not raw URL strings).

**Bug (live):** In the 3-column FAQ grid, long answers visually detach from their question (text appears as full-width fragments between rows). Each Q+A must stay inside one grid cell / card.

## Goals (locked)

1. Each FAQ item: **icon + question on one row** (`align-items: center`; icon does not wrap alone).
2. FAQ grid: **1 col** default; **2 cols** ≥700px; **3 cols** ≥960px — inside the single FAQ surface section.
3. Contact FAQ UI renders **`<a>` links** for Email, WhatsApp, LinkedIn; JSON-LD `acceptedAnswer` stays the plain-text `answer` string (AEO).
4. **Containment:** each `.home-profile__faq-card` is a nested surface (`background` + padding) with `min-width: 0`, `align-items: start` on the grid (no stretch that mixes columns), `overflow-wrap: anywhere`, so answer text never paints across sibling columns.

## Non-goals

- Changing FAQ question copy or JSON-LD question wording.
- Redesigning other home sections.
- eReport / product hubs.

## Acceptance

- [x] Spec written
- [x] Icon + question lateral row; FAQ column breakpoints confirmed
- [x] Contact FAQ has real links in the UI
- [x] Each Q+A contained in its own card (no full-width answer fragments)
- [x] FE build + commit/push

## Affected paths

- `specs/050-home-faq-lateral/spec.md`
- `frontend/src/components/Home/HomeProfile.astro`
- `frontend/src/components/Home/HomeProfile.css`
- `frontend/src/lib/eduardoProfile.ts`
- `.memory/MILESTONE-*.md`
