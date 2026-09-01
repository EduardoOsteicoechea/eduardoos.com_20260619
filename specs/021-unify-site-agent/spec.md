# Feature 021 — Unify site agent (home dock) + contact padding

## Status

**Amend (2026-09-01):** Contact agent tray must be **visually identical** to the home sticky tray — same shared chrome class, not a bare column.

## Problem

Contact chat was a different product from the home dock. Chrome Email/WhatsApp buttons duplicated ContactChannels. Visitors need in-chat links/buttons and email-to-Eduardo handoff, with identical dock chrome on both pages (welcome text may differ).

**Amend:** Contact `/contact` still rendered the docked `ContactAgent` **without** the home tray shell (no border / surface / shadow / viewport height), so it looked bare and unlike home.

## Goals

1. Shared dock preset: `alwaysShowChat`, title **`"Talk To Assistant"`**, `askPath` = `/api/profile/ask`, **`showDirectLinks: false`** (no chrome Email/WhatsApp).
2. `/` and `/contact` mount that preset; only `welcomeMessage` (+ `scopeId` / `skillLabel`) differ.
3. Contact page: full-bleed `--page-inline-pad`; keep intro + `ContactChannels` outside the agent.
4. **Identical tray shell:** both pages wrap `ContactAgent` in a shared **`.site-agent-tray`** shell (same padding, border, radius, surface, shadow, backdrop blur, sticky viewport height as home’s `.home-hero__chat` tray). Contact must not strip that chrome.
5. Desktop contact layout: intro | tray with the same gutter language as home (`--home-gap`); agent column width comparable to home’s third column (`1fr` beside a `2fr` intro).
6. In-chat capabilities: Markdown links (incl. `mailto:`) in replies; action chips for `whatsapp` / email-notify confirmation; server still emails Eduardo via `[[CONTACT_EMAIL]]`.

## Non-goals

- Removing `/contact` or home hero photo layout.
- Hiding the contact agent on mobile (home may hide tray &lt;960px; contact keeps the tray visible with the same shell chrome).
- Auto-`window.open` for WhatsApp (chip/link click only).

## Acceptance

- [x] Shared preset; no chrome Email/WhatsApp on either dock.
- [x] Panels identical except initial welcome.
- [x] Contact lateral pad; agent not in a heavy *extra* card beyond the shared tray.
- [x] Markdown `mailto:` + https links; WhatsApp/email actions surface in chat UI; FE build green.
- [x] Contact tray uses `.site-agent-tray` with the **same** visual chrome + sticky fill as home; side-by-side they match.

## Affected paths

- `specs/021-unify-site-agent/spec.md`
- `frontend/src/pages/contact.astro`, `frontend/src/pages/index.astro`
- `frontend/src/styles/pages.css`
- `frontend/src/components/Contact/ContactAgent.css` (dock fill inside tray only)
- `frontend/src/lib/agentVoice.ts` (preset unchanged)
