# Feature 045 — Global theme tokens + Music / eVoice / Pamphlet dashboards

## Status

**Done** (2026-09-01) — Product HDS menus are icon-only Material Symbols.

## Acceptance
- [x] theme tokens + three breakpoint lists; no borders; Calibri/14px
- [x] Pamphlet + Scrib locked dimensions untouched
- [x] Music / eVoice / Pamphlet dashboards + `?view=` + header dynamic
- [x] Music Upload new/v2
- [x] eVoice crawl API + UI + tests
- [x] FE build + commit/push
- [x] `ProductHeaderMenu` / product HDS buttons are **icon-only** Material Symbols (always, no exception — no visible text labels)
- [x] Single-line inputs + selects + `.btn` share exact `--bmh` height globally (incl. eReport org forms)
- [x] Inputs/selects/textarea use visible `--site-input-bg` (contrast vs page `--bg` in light + dark)
- [x] Phone header + HDS icon buttons use `--ui-scale: 2` via `--chrome-control-size` (2× prior too-small chrome)
- [x] Tablet header rail + HDS icon buttons use `--ui-scale: calc(4 / 3)` (correct 0.75× undersize)
- [x] Desktop chrome unchanged (`--ui-scale: 1`); page `.btn` / inputs still `--bmh` only

## Problem

Site chrome and product hubs still use mixed `--site-*` tokens, rem drift, and borders. Music / eVoice / Pamphlet need a card dashboard at the route base plus section views, without breaking locked mm/px apps (Pamphlet canvas, Scrib).

## Goals (locked)

### Typography & root
- Font stack: **Kumbh Sans** (see spec 048) — `"Kumbh Sans", system-ui, sans-serif` with YOPQ 300. (Supersedes Calibri from the original 045 ship.)
- Root font-size: **`calc(14px * var(--site-text-scale, 1))`** on `html`.
- **Pass-through (do not rem-convert):** Pamphlet document canvas and Scrib sheet/layout that use locked **mm / px** (including 0.5px rules).

### Spacing tokens (same scale for `--m*` and `--p*`)

| Token | Desktop rem |
|---|---|
| `--m1` / `--p1` | `0.75rem` |
| `--m2` / `--p2` | `1.125rem` |
| `--m3` / `--p3` | `1.5rem` |
| `--m4` / `--p4` | `2.25rem` |
| `--m5` / `--p5` | `3rem` |

- Tablet (768–1099.98px): ×0.9 of desktop.
- Phone (max 767.98px): ×0.8 of desktop; `--lbw: 0`.
- Desktop (min 1100px): full table; `--lbw: 4.285714rem`.

### Control / chrome
- `--bmh` / `--bmw`: `2.25rem` desktop (×0.9 tablet, ×0.8 phone).
- `--lbw`: `4.285714rem` desktop; tablet scales with chrome (see below); `0` phone.
- `--br`: `0.215rem`.
- **`--control_min_height` = `--bmh`** (alias; do not invent a second control height).
- **Equal control height (global, locked):** every **single-line** text-like `input`, every `select`, and every `.btn` (all variants — primary blue, secondary gray, green/yellow/red) MUST share the **same outer height**: `height` / `min-height` / `max-height` = `var(--bmh)`, `box-sizing: border-box`, vertical padding `0` (horizontal via `--p2`). Inputs must not look shorter than the blue `.btn--primary` / `.btn--blue` buttons (eReport org forms and all other product hubs).
- **Visible input fill (global, locked):** single-line `input`, `select`, and `textarea` MUST use **`--site-input-bg`**, which is **visibly distinct from page `--bg` in both light and dark** (not transparent, not `--site-body-bg` / `--bg`). Light: solid near-white `#ffffff`. Dark: elevated mix toward `--fg` (readable field box on `#0e1116`). Product overrides must not reset inputs back to page `--bg`.
- **Excluded from equal height:** `textarea` height may grow (min-height only); `input[type=checkbox|radio|range|file|color|hidden]`; Pamphlet document canvas / Scrib sheet geometry (mm/px pass-through); dedicated transport/HDS icon controls that use their own size tokens (e.g. `--playlist-control-size`, header-dynamic icon buttons).

### Header + icon chrome scale (amendment 2026-09-03)

After the 045 rem shrink, site **header** and **header icon buttons** rendered ~0.5× (phone) and ~0.75× (tablet) of intended touch size. Restore via `--ui-scale` applied **only** to site chrome — not to page `--m*`/`--p*`, not to form `.btn` / inputs (`--bmh` stays as above).

| Breakpoint | `--ui-scale` | Chrome control size |
|---|---|---|
| Phone (max 767.98px) | `2` | `calc(var(--bmh) * 2)` |
| Tablet (768–1099.98px) | `calc(4 / 3)` | `calc(var(--bmh) * 4 / 3)` |
| Desktop (min 1100px) | `1` | `var(--bmh)` |

- **`--chrome-control-size`** = `calc(var(--bmh) * var(--ui-scale))`.
- **`--header-dynamic-control-size`** = `--chrome-control-size` (HDS / ProductHeaderMenu icon buttons).
- Phone top bar: `--header_bar_height` = `--chrome-control-size`; `--header_height` = `calc(var(--chrome-control-size) * 1.35)`; `--header_offset` includes safe-area.
- Logo, hamburger, avatar, and HDS icon buttons all use `--chrome-control-size` (not raw `--bmh`).
- Tablet/desktop left rail: `--lbw` / `--header_width` must fit chrome controls + horizontal pad (scale tablet rail with `--ui-scale`).
- **Non-goal of this amendment:** changing Pamphlet mm/px sheet geometry or pamphlet `zoom: 0.5` edit-tray compensation.

### Colors
- Light: `--bg:#f2f3f6` `--fg:#141820`
- Dark: `--bg:#0e1116` `--fg:#e8eaef`
- Buttons ISO: blue `#2563eb`, green `#16a34a`, yellow `#ca8a04`, red `#dc2626` (yellow fg near-black `#141820`; others white).
- Aliases: `--site-body-bg`→`--bg`, `--site-body-fg`→`--fg`, `--site-accent`→`--btn-blue`.
- `--border_001: none` (no borders site-wide, including header).

### Routing
- Music: `/media/musica?view=dashboard|playlists|free|rec|upload|letters|manage`
- eVoice: `/evoice?view=dashboard|admin|upload|docs|audios|playlists|print|crawl`
- Pamphlet: `/documents/pamphlet?view=dashboard|recent|open|new|manage|footers`

### Music / eVoice / Pamphlet dashboards
As previously specified: cards + header dynamic menu; Music Upload = new + v2 cards; eVoice crawl = validate URL → cleaner → DeepSeek TTS text → save doc (+ generate path); Pamphlet mm/px pass-through.

### Header Dynamic Section (HDS) — ProductHeaderMenu
- **Always, no exception:** product hub buttons mounted in `#header-dynamic-menu-host` are **icon-only** (Google Material Symbols).
- **Forbidden:** visible text / short-label text on those buttons (text buttons are unacceptable).
- Each item supplies: `id`, accessible `label` (for `title` + `aria-label` only), and Material Symbol `icon` name.
- Shared chrome: `header-dynamic-menu__btn` sizing; active view uses active/pressed styling.
- Applies to every consumer of `ProductHeaderMenu` (eVoice, Music, Pamphlet, Homescool, eReport, …).

## Non-goals
- Changing Scrib or Pamphlet mm/px geometry.
- Nested path segments for hub views.
- HTML-from-DeepSeek crawl path.
- Extra themes beyond light/dark.
- Visible text labels on product HDS buttons.

## Affected paths
- `specs/045-global-theme-product-dashboards/spec.md`
- `frontend/src/styles/theme.css`, `global.css`, `buttons.css`, Header, BaseLayout
- `frontend/src/components/ProductDashboard/**`
- `frontend/src/components/{Playlist,PlaylistBuilder,Evoice}/**`, pamphlet page shell
- `backend/internal/evoice/**`
- `.memory/MILESTONE-*.md`
