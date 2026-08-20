# Feature 021 — Unify site agent (home dock) + contact padding

## Problem

Contact chat is a different product from the home dock (copy, API, chrome). Home lacks in-chat Email/WhatsApp. Contact page shell is capped at `--max_desktop_width`, so lateral spacing does not match home’s `--page-inline-pad` rhythm.

## Goals

1. One shared agent preset = home dock: `alwaysShowChat`, title `"AI agent"`, `HOME_AGENT_WELCOME`, `askPath` = `/api/profile/ask`, `showDirectLinks: true`.
2. `/` and `/contact` both mount that preset (`skillLabel` / `scopeId` may differ for telemetry/gate).
3. Contact page: full-bleed width, `padding-inline: var(--page-inline-pad)`; agent column without boxed card chrome so the dock matches home.
4. Keep contact intro + `ContactChannels` in the left column.

## Non-goals

- Changing backend prompt corpus (`PROFILE_CONTEXT.md` / `identity.go`).
- Removing `/contact` or home hero photo layout.
- Making contact use `pageHome` / fixed viewport dock math from home.

## Acceptance

- [x] Shared preset exported and used by both pages.
- [x] Home and contact docked agent show Email + WhatsApp.
- [x] Contact lateral inset matches `--page-inline-pad`; agent not in a heavy card.
- [x] FE `npm run build` green.
