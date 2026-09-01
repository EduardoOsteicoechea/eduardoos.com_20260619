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

## Problem

Site chrome and product hubs still use mixed `--site-*` tokens, rem drift, and borders. Music / eVoice / Pamphlet need a card dashboard at the route base plus section views, without breaking locked mm/px apps (Pamphlet canvas, Scrib).

## Goals (locked)

### Typography & root
- Font stack: `Calibri, system-ui, sans-serif`.
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
- `--lbw`: `4.285714rem` desktop/tablet; `0` phone.
- `--br`: `0.215rem`.

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
