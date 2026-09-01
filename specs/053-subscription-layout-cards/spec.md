# Feature 053 — Subscription page left-align + product-dash cards

## Status

**Ready** (2026-09-01) — locked from user: left-align + subscription options as cards like the rest of the product layout.

## Problem

`/payments/subscription` presents content horizontally centered (`margin: 0 auto`, ~40rem column) and lists services as a narrow single-column checklist. Other product hubs use left-aligned full-width gutters and ProductDashboard-style card grids (specs 045 / 046 / 047).

## Goals (locked)

1. **Left-align** the subscription page (signed-in and signed-out gate) using the same outer gutters as product dashboards (spec 046):
   - Horizontal: `--page-inline-pad` (`--p2`)
   - Top: `--p3`
   - Bottom: `--p5`
   - No `margin: 0 auto` centering of the main column; content starts at the left content edge.

2. **Subscription options as cards** matching ProductDashboard visual language:
   - Responsive grid like `.product-dash__grid` (`repeat(auto-fill, minmax(11rem, 1fr))`, gap `--m2`, equal-height stretch).
   - Card chrome like `.product-dash__card`: `--site-surface`, no borders, `--br`, padding `--p3`, left-aligned text, Material Symbol icon + title head (spec 047).
   - Show price on the card (e.g. `$1/mo`) plus existing description.
   - Icons match tray / nav Material Symbols for the same service ids (`music_note`, `description`, `school`, `church`, `edit_note`, `assignment`, `record_voice_over`).

3. **Multi-select** remains: clicking a card toggles selection. Selected cards use a clear active visual (accent mix / `--active` pattern as in eReport org cards). Keyboard/accessibility: selectable control with checked state (checkbox may be visually hidden if the card is the control).

4. Keep billing period toggle, total, prepare-checkout form, PayPal button, and entitlements list — behavior unchanged; only layout/chrome of the page shell and service picker change.

## Non-goals

- Changing pricing, PayPal intent / hosted-button flow, entitlement APIs, or catalog service ids.
- Turning Subscribe into a multi-view ProductHub with Header Dynamic Menu.
- Restyling checkout / entitlements into the service card grid.

## Acceptance

- [x] Subscription page content is left-aligned within product gutters (not horizontally centered).
- [x] Billable services render in a ProductDashboard-style responsive card grid with Material icons.
- [x] Selected cards are visually distinct; multi-select + Prepare checkout still work.
- [x] Signed-out gate uses the same left-aligned shell.
- [x] Frontend `npm run build` succeeds.

## Affected paths

- `frontend/src/components/Subscription/SubscriptionPage.tsx`
- `frontend/src/components/Subscription/SubscriptionPage.css`
- `frontend/src/lib/payments.ts` (optional: catalog `icon` field; otherwise map icons in the page component)
- `specs/053-subscription-layout-cards/spec.md`
