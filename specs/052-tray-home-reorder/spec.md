# Feature 052 — Tray Home link + product order

## Status

**Done** (2026-09-01).

## Problem

The global hamburger tray has no **Home** row (only the rail logo). Product links are in an old order that puts Contact first and buries BIM IFC / Articles.

## Goals (locked)

Tray sequence (top → bottom), same `<a>` styling as today:

1. **Home** (`/`) — always visible; Material Symbol `home`
2. **Contact** — always visible
3. **BIM IFC viewer** — always visible
4. **Articles** — always visible
5. **Music** — subscription-gated (`playlist`)
6. **Pamphlet** — subscription-gated (`pamphlet`)
7. **Scrib** — subscription-gated (`scrib`)
8. **Calvin’s Institutes** — always visible
9. Remaining gated products (unchanged visibility): **Homescool**, **Church** (flag), **eReport**, **eVoice**
10. **Admin users** — platform admin only (existing `isAdmin` block in `Header.tsx`)
11. **Agent Sandbox** — platform admin only (same block)

Visibility rules from spec 038 stay: public rows always shown; billable rows require admin / active entitlement / Homescool student bypass / eVoice allowlist; Admin users + Agent Sandbox never shown to non-admin.

## Non-goals

- Changing rail logo, auth links, or tray chrome (A+ / A− / theme / close).
- Making Admin users or Agent Sandbox visible to non-admin.
- Removing Homescool / eReport / eVoice / Church from the tray (they keep existing gates, after Calvin).

## Acceptance

- [x] Tray first row is Home → `/`
- [x] Listed public + Music/Pamphlet/Scrib/Calvin order matches goals 2–8
- [x] Admin users and Agent Sandbox render only when `isAdmin`
- [x] `npm run test:service-access` + FE build green

## Affected paths

- `specs/052-tray-home-reorder/spec.md`
- `frontend/src/lib/navServices.ts`
- `frontend/src/lib/serviceAccess.test.mjs`
- `frontend/src/components/Header/Header.tsx` (admin block unchanged unless comments)
