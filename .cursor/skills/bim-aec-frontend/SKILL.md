---
name: bim-aec-frontend
description: >-
  Frontend design for BIM/AEC products (Eduardo OS): blueprint vernacular,
  light/dark tokens, dense tools, plain CSS. Use when styling or building UI for
  OpenBIM, APS, pamphlets, documents, or any AEC surface on this site.
---

# BIM / AEC Frontend (Eduardo OS)

Companion to `frontend-design` and `elegant-formal-ui`. Apply all three: general
craft from `frontend-design`, domain constraints from this file, and gallery-atelier
elevation from `elegant-formal-ui` on chrome / home / contact.

## Subject & audience

- **Subject:** architecture, engineering, construction — models, drawings, documents, field tools.
- **Audience:** practitioners who expect clarity over decoration; tools must stay readable at density.
- **Job of chrome:** orient, authenticate, switch tools — never compete with the model/sheet.

## Visual vernacular (signature)

Favor **blueprint / drafting** cues elevated toward **gallery-atelier** formality — not
consumer SaaS purple, cream-terracotta defaults, or neon hacker grids:

| Role | Light | Dark |
|------|-------|------|
| Paper / body | Cool limestone with blue cast | Evening ink (charcoal + blue) |
| Ink / text | Near-black slate | Soft paper white |
| Accent | Muted steel / blueprint | Quiet steel (not neon cyan) |
| Borders | Soft graphite lines | Hairline cool gray |
| Surfaces | Elevated paper panels | Gallery charcoal panels |

Fonts: **Cormorant Garamond** (brand/display, restrained), **Montserrat** (UI),
**Raleway** (secondary/body), **Roboto** (data/utility). Keep plain CSS; no Tailwind / CSS-in-JS.
See `elegant-formal-ui` for home atmosphere and anti-grid rules.

## Product rules (non-negotiable here)

1. Theme via `html[data-theme="light"|"dark"]` + `html.dark`; persist `localStorage` key `eduardoos-theme`.
2. All colors from `--site-*` tokens in `theme.css` — no hard-coded hex in components except pamphlet print paper white.
3. Global **Theme** control in the main menu toggles light/dark (must work on every layout including PamphletLayout).
4. Dense editors (pamphlet, APS, BIM): prioritize contrast, focus rings, and overflow scrolling over ornament.
5. Respect `prefers-reduced-motion`.
6. Server errors: copyable modal (`ServerErrorModal`) — never console-only.
7. **Activity bar / transport icons** MUST stay legible in light and dark: `currentColor` (or `--site-body-fg` / `--site-accent-fg` on accent fills). No hardcoded white/light-gray strokes that vanish on light chrome.

## Layout cues

- One clear primary action per section.
- Toolbars may scroll horizontally when controls overflow (edit trays, action bars).
- Avoid card grids in heroes; cards only when they wrap an interaction.
- Dark mode is first-class — not an afterthought invert.

## Anti-patterns

- Purple-on-white / indigo gradient “AI SaaS” look.
- Warm cream + terracotta + display serif default.
- Broadsheet hairline newspaper pastiche unless the brief asks for it.
- Glow stacks, pill spam, emoji as UI chrome.
