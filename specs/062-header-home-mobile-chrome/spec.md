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

## Amendment 2026-09-03b — phone HDS toggle visibility + nav gap

### Problems
1. Phone HDS tune toggle / drawer often never appeared (Header `client:only` vs product islands: host lookup one-shot → portal never mounts → `hasTools` stays false).
2. Phone main nav tray sat below a gap under the top bar because `--header_offset` used `--header_height` (= chrome × 1.35) while the bar height uses `--header_bar_height` (= chrome × 1).

### Fixes
1. Shared `useHeaderDynamicHost` with retry until `#header-dynamic-menu-host` exists; ProductHeaderMenu + other HDS portals use it. Phone toggle visibility also via CSS `:has(.header-dynamic-menu-host:not(:empty))` (not only React state).
2. Phone: `--header_height` = `--chrome-control-size` (same as bar row); `--header_offset` = bar + safe-area so `.site-header__nav` flush under the bar.

Auth gate unchanged.
