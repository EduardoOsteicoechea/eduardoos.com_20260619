# Feature 062 — Header chrome size, logo, phone HDS drawer, home mobile scroll

## Problem

1. Phone header / HDS icon controls are ~**1.5×** larger than intended after the 045 `--ui-scale: 2` amendment.
2. The header logo sits on a surface plate; it should be icon-only (no background fill).
3. On phone, Header Dynamic Section (HDS) tools overflow the center slot and are hard to use.
4. Home scroll on mobile feels janky (hurts UX and Core Web Vitals–adjacent mobile experience / ranking signals).
5. Auth gate (`data-auth-check` / visibility hide) works well and must not change.

## Goals

1. **Phone chrome scale** — set `--ui-scale` on phone (`max-width: 767.98px`) from `2` to **`calc(4 / 3)`** so `--chrome-control-size` / `--header-dynamic-control-size` shrink by **1.5×**. Tablet (`4/3`) and desktop (`1`) stay as in 045. Page `.btn` / inputs remain on `--bmh` only.
2. **Logo** — `.site-header__logo` has **no fill background** (transparent). Hover may use a light wash only; no `--site-surface` plate.
3. **Phone HDS drawer (phone only)** — in the header dynamic slot, when HDS content is mounted:
   - Show a **single toggle button** (Material Symbol, e.g. `tune` / `more_horiz`) sized like other chrome controls.
   - Closed: HDS action buttons are **not** laid out in the top bar (no horizontal overflow row).
   - Open: show a **left lateral panel** (under the top bar, similar footprint to the main nav tray) listing the HDS actions vertically; backdrop dismiss; Escape closes; toggle `aria-expanded` / `aria-controls`.
   - Tablet/desktop: unchanged vertical rail HDS (no phone toggle).
4. **Home mobile scroll** — on phone (and preferably tablet), disable `background-attachment: fixed` on `html.page-home body` (use `scroll` / default). Keep wash gradients; do not remove AEO/SSR profile content. No auth/layout changes on home.
5. **SEO / ranking hygiene** — keep home profile + FAQ **server-rendered** and crawlable; do not hide public home behind auth; improve scroll jank without shrinking content.

## Non-goals

- Changing `BaseLayout` `requireAuth` / `data-auth-check` / token script / `visibility: hidden` gate.
- Changing tablet/desktop `--ui-scale`.
- Rewriting AEO copy, JSON-LD, or hero composition (018).
- Per-product HDS menu React rewrites (drawer must work via shared host CSS/behavior for all portals).

## Acceptance

- [x] Phone chrome controls ≈ 1.5× smaller than pre-fix (`--ui-scale: 4/3`).
- [x] Logo has no opaque/surface background.
- [x] Phone with HDS: one toggle → lateral tools panel; closed bar stays clean.
- [x] Tablet/desktop HDS layout unchanged.
- [x] Home mobile scroll no longer uses fixed background attachment.
- [x] Auth gate code paths untouched.
- [x] FE build green; commit + push.

## Affected paths

- `specs/062-header-home-mobile-chrome/spec.md`
- `specs/045-global-theme-product-dashboards/spec.md` (amend phone `--ui-scale` table)
- `frontend/src/styles/theme.css`
- `frontend/src/styles/global.css` (home background-attachment)
- `frontend/src/components/Header/Header.css` (logo)
- `frontend/src/components/HeaderDynamicMenu/HeaderDynamicMenu.tsx`
- `frontend/src/components/HeaderDynamicMenu/HeaderDynamicMenu.css`
- `.memory/MILESTONE-*.md`
