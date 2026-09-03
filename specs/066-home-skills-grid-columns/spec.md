# Feature 066 — Home Skills and Stack 3-column layout

## Problem

On desktop (≥960px), the "Skills and Stack" section in `HomeProfile.astro` displays the 6 skill cards in a single row of 6 columns (`grid-template-columns: repeat(6, minmax(0, 1fr))`). Each card becomes very narrow and cramped, with awkward word wraps and tight icon alignment next to the AI assistant dock.

## Goals

1. Change desktop (≥960px) layout of `.home-profile__skill-grid` from 6 columns to **3 columns** (`repeat(3, minmax(0, 1fr))`).
2. Maintain equal height and stretch behavior for cards across the two 3-card rows.
3. Keep narrow/mobile viewports responsive (single column below 700px, 3 columns from 700px up).

## Non-goals

- Altering skill card content, text, or icons.
- Altering the Technical Stack text or other dossier sections.
- Changing mobile single-column behavior.

## Acceptance

- [x] At `min-width: 960px`, `.home-profile__skill-grid` renders in 3 columns (2 rows of 3 cards) instead of 6 columns.
- [x] Frontend builds without errors.
- [x] Changes committed and pushed to remote.

## Affected paths

- `specs/066-home-skills-grid-columns/spec.md`
- `frontend/src/components/Home/HomeProfile.css`
- `.memory/MILESTONE-066-home-skills-3-columns-20260903.md`
