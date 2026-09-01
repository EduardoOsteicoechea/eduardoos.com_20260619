# Feature 021 — Unify site agent (home dock) + contact padding

## Problem

Contact chat was a different product from the home dock. Chrome Email/WhatsApp buttons duplicated ContactChannels. Visitors need in-chat links/buttons and email-to-Eduardo handoff, with identical dock chrome on both pages (welcome text may differ).

## Goals

1. Shared dock preset: `alwaysShowChat`, title **`"Talk To Assistant"`**, `askPath` = `/api/profile/ask`, **`showDirectLinks: false`** (no chrome Email/WhatsApp).
2. `/` and `/contact` mount that preset; only `welcomeMessage` (+ `scopeId` / `skillLabel`) differ.
3. Contact page: full-bleed `--page-inline-pad`; agent column without card chrome.
4. Keep contact intro + `ContactChannels` outside the agent.
5. In-chat capabilities: Markdown links (incl. `mailto:`) in replies; action chips for `whatsapp` / email-notify confirmation; server still emails Eduardo via `[[CONTACT_EMAIL]]`.

## Non-goals

- Removing `/contact` or home hero photo layout.
- Making contact use `pageHome` fixed dock math.
- Auto-`window.open` for WhatsApp (chip/link click only).

## Acceptance

- [x] Shared preset; no chrome Email/WhatsApp on either dock.
- [x] Panels identical except initial welcome.
- [x] Contact lateral pad; agent not in a heavy card.
- [x] Markdown `mailto:` + https links; WhatsApp/email actions surface in chat UI; FE build green.
