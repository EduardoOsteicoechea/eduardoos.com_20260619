# Feature 048 — Kumbh Sans site-wide font

## Status

**Done** (2026-09-01).

## Problem

Site UI still stacks Calibri / legacy Montserrat·Raleway·Roboto·Cormorant hardcodes. The brand wants one Google Font — **Kumbh Sans** (variable, YOPQ 300) — for the whole site chrome and product UI.

## Goals (locked)

1. Load **Kumbh Sans** from Google Fonts (`wght` 100–900, axis `YOPQ` @ 300) in `BaseLayout` and `PamphletLayout` (alongside existing Material Symbols).
2. Theme tokens `--font-brand`, `--font-sans`, `--font-display`, `--font-body`, `--font-utility` all resolve to `"Kumbh Sans", system-ui, sans-serif`.
3. Root `html`/`body` use `font-family: var(--font-body)`, `font-optical-sizing: auto`, and `font-variation-settings: "YOPQ" 300`.
4. UI CSS that hardcodes Montserrat / Raleway / Roboto / Calibri / Cormorant Garamond for sans UI must use the theme tokens (or `"Kumbh Sans"`) so inheritance cannot be overridden back to the old stack.
5. Spec 045 spacing/color/root-size rules unchanged except **font stack** (Calibri → Kumbh Sans).

## Non-goals

- Pamphlet **PDF** embedded TrueType (backend `pkg/pdf`) and on-canvas pamphlet-generator document typefaces kept for print parity.
- Monospace stacks (`ui-monospace`, Consolas, Roboto Mono, etc.) for code/logs.
- Material Symbols Outlined icon font.
- Changing root font-size (`14px × --site-text-scale`).

## Acceptance

- [x] Google Fonts preconnect + Kumbh Sans stylesheet in both layouts
- [x] All `--font-*` tokens = Kumbh Sans stack
- [x] `html`/`body` optical sizing + YOPQ 300
- [x] No Montserrat / Raleway / Roboto / Calibri / Cormorant Garamond left as **UI** `font-family` (monospace + pamphlet-generator document canvas exempt)
- [x] FE build + commit/push

## Affected paths

- `specs/048-kumbh-sans-site-font/spec.md`
- `frontend/src/layouts/BaseLayout.astro`
- `frontend/src/layouts/PamphletLayout.astro`
- `frontend/src/styles/theme.css`
- `frontend/src/styles/global.css`
- UI component `.css` files under `frontend/src/` that hardcode legacy sans stacks
- `.memory/MILESTONE-*.md` after ship
