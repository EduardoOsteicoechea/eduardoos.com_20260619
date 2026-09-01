# Feature 050 — Home FAQ lateral questions

## Status

**Done** (2026-09-01) — FAQ cards stacked full-width (column).

## Problem

Home FAQ cards were shown in a multi-column grid (2/3 cols on wide viewports). They must stack **one above another**, each card **full width** of the FAQ section (`flex-direction: column`).

Keep: icon + question on one lateral row; contact FAQ with real Email / WhatsApp / LinkedIn links; Q+A containment inside each card.

## Goals (locked)

1. Each FAQ item: **icon + question on one row** (`align-items: center`; icon does not wrap alone).
2. FAQ list container (`.home-profile__faq-grid`): **`display: flex; flex-direction: column`** at **all** breakpoints — cards stacked vertically, each **full width** (`width: 100%` / `align-self: stretch`). No 2- or 3-column FAQ layout.
3. Contact FAQ UI renders **`<a>` links** for Email, WhatsApp, LinkedIn; JSON-LD `acceptedAnswer` stays the plain-text `answer` string (AEO).
4. **Containment:** each `.home-profile__faq-card` is a nested surface (`background` + padding) with `min-width: 0`, `overflow-wrap: anywhere`.

## Non-goals

- Changing FAQ question copy or JSON-LD question wording.
- Redesigning other home sections.
- eReport / product hubs.

## Acceptance

- [x] Spec written
- [x] Icon + question lateral row
- [x] FAQ list is a single column (flex column) at all widths; each card full width
- [x] Contact FAQ has real links in the UI
- [x] Each Q+A contained in its own card
- [x] FE build + commit/push

## Affected paths

- `specs/050-home-faq-lateral/spec.md`
- `frontend/src/components/Home/HomeProfile.astro`
- `frontend/src/components/Home/HomeProfile.css`
- `frontend/src/lib/eduardoProfile.ts`
- `.memory/MILESTONE-*.md`
