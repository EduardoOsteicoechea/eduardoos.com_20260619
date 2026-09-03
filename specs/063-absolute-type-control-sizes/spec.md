# Feature 063 — Absolute font + input + button sizes (16px root)

## Problem

Site type and form chrome still drift by breakpoint (`--bmh` / fonts shrink on phone/tablet via rem lists) and the document root was **14px**, so “1rem” never matched a normal browser default. Google/mobile readability and global UI parity need a single absolute scale.

## Goals (locked)

1. **Root font size:** `html { font-size: calc(16px * var(--site-text-scale, 1)); }` — default **16px** when A+/A− scale is `1`.
2. **Absolute type tokens** (same on phone, tablet, desktop — must not be overridden in breakpoint blocks):

| Token | Value at scale 1 |
|---|---|
| `--font-xs` | `calc(12px * var(--site-text-scale, 1))` |
| `--font-sm` | `calc(14px * var(--site-text-scale, 1))` |
| `--font-base` / `--font-md` | `calc(16px * var(--site-text-scale, 1))` |
| `--font-lg` | `calc(20px * var(--site-text-scale, 1))` |
| `--font-xl` | `calc(24px * var(--site-text-scale, 1))` |

3. **Absolute control tokens** (same on all breakpoints):

| Token | Value at scale 1 |
|---|---|
| `--bmh` / `--bmw` | `calc(36px * var(--site-text-scale, 1))` |
| `--control_min_height` | `var(--bmh)` |
| `--control_min_width` | `var(--bmw)` |
| `--br` / `--border_radius_001` | `calc(3.44px * var(--site-text-scale, 1))` (≈ former `0.215rem` @ 16px) |

4. **Global enforcement:**
   - `body` uses `font-size: var(--font-base)`.
   - Every single-line text-like `input`, every `select`, and every `.btn` MUST use `height` / `min-height` / `max-height: var(--bmh)`, `font-size: var(--font-base)` (`.btn` may use `--font-sm` only where an existing marketing CTA style already does — home/contact CTA row), `box-sizing: border-box`, vertical padding `0`, horizontal via `--p2`.
   - **Forbidden:** phone/tablet media queries changing `--bmh`, `--bmw`, `--font-*`, or `--br`.
   - **Forbidden:** product CSS resetting single-line input / `.btn` height or body-control `font-size` to ad-hoc rem/px that bypass these tokens (Pamphlet canvas / Scrib sheet mm/px remain pass-through).

5. **Header chrome** still uses `--chrome-control-size: calc(var(--bmh) * var(--ui-scale))` (spec 045/062). Because `--bmh` is absolute, chrome stays proportional and consistent.

6. **Spacing `--m*` / `--p*`:** may still use rem lists with phone ×0.8 / tablet ×0.9 (layout density only). Not part of the absolute type/control lock.

7. Amends **045** typography/root and control sections (14px → 16px; drop control shrink by breakpoint).

## Non-goals

- Changing auth gate.
- Rewriting all marketing dossier `clamp()` / decorative rem type in HomeProfile (body + form chrome are the lock; hero display type may stay expressive).
- Pamphlet/Scrib mm/px geometry.

## Acceptance

- [x] `html` default computed font-size is 16px at `--site-text-scale: 1`.
- [x] `--bmh` / `--font-base` identical in phone, tablet, and desktop computed styles (aside from A+/A−).
- [x] Global inputs + `.btn` use `--bmh` + `--font-base` (or documented CTA `--font-sm`).
- [x] Specs 045 + 063 updated; FE build; commit + push.

## Affected paths

- `specs/063-absolute-type-control-sizes/spec.md`
- `specs/045-global-theme-product-dashboards/spec.md`
- `frontend/src/styles/theme.css`
- `frontend/src/styles/global.css`
- `frontend/src/styles/buttons.css`
- `.memory/MILESTONE-*.md`
