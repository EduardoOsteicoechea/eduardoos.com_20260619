---
name: elegant-formal-ui
description: >-
  Elegant, formal, stylized UI for Eduardo OS (gallery-atelier / drawing-room
  architecture). Use with frontend-design + bim-aec-frontend when restyling
  chrome, home, contact, or marketing surfaces toward quiet luxury — not
  hacker-grid, purple SaaS, cream/terracotta, or broadsheet pastiche.
---

# Elegant Formal UI (Eduardo OS)

Companion to `frontend-design` and `bim-aec-frontend`. Apply all three:

| Skill | Role |
|-------|------|
| `frontend-design` | Distinctive craft; avoid AI-default clusters |
| `bim-aec-frontend` | AEC/BIM domain: blueprint steel, dense tools, light/dark |
| **this skill** | Elevate chrome & visitor surfaces toward **elegance, formality, stylization** |

## Aesthetic thesis

**Gallery-atelier for architecture** — a quiet drawing room or atelier wall, not a SOC dashboard.

- Atmosphere: limestone, ink, soft steel — cool and composed.
- Mood: formal, refined, slightly stylized; never neon, never “hacker grid.”
- Blueprint cues stay **whispered** (hairline rules, cool cast), not a loud drafting overlay.

## Palette (map to `--site-*` in `theme.css`)

Named roles (hex are anchors; always ship via tokens):

| Role | Light | Dark |
|------|-------|------|
| Limestone / body | `#f2f3f6` cool stone | `#0e1116` evening ink |
| Ink / text | `#141820` | `#e8eaef` soft paper |
| Steel accent | `#3d5a80` muted blueprint | `#8fa8c8` quiet steel |
| Accent on fill | `#f7f8fa` | `#0e1116` |
| Surface | `#fafbfc` elevated paper | `#161b24` gallery panel |
| Border | soft graphite ~14–18% ink | cool hairline ~14% paper |

Avoid: purple/indigo SaaS, warm cream `#F4F1EA` + terracotta, acid-green accents, bright cyan neon, heavy multi-layer glows.

## Typography

Load via Google Fonts in `BaseLayout` / `PamphletLayout`:

| Role | Face | Use |
|------|------|-----|
| **Display / brand** | **Cormorant Garamond** | Hero brand name, occasional page titles — restraint only |
| UI / structure | Montserrat | Nav, buttons, section chrome |
| Secondary / body | Raleway | Leads, blurbs, longer reading |
| Utility / data | Roboto | Meta labels, timestamps, dense tools |

Rules:

- Brand is the loudest type moment; headlines must not overpower the name.
- Prefer letter-spacing and weight over size shouting.
- Utility uppercase labels: small, tracked, Raleway or Roboto — never shouty Montserrat black.

## Layout & surfaces

1. **Home first viewport:** brand-first composition — brand, one role line, one lead, one CTA group, optional agent panel. No dashboard clutter (stats, chips, icon rows).
2. **Atmosphere:** soft vignette / radial wash + *very* faint structure (wide spacing or single hairline plane). Do **not** use dense neon grids.
3. **Chrome:** left rail 60px desktop; glassed or quiet solid surface; hairline borders; formal spacing.
4. **Agent panel:** gallery frame — calm border, muted surface, refined title; interaction card OK.
5. **Radius:** keep small (`--border_radius_001` ≤ 4px); elegance from proportion, not pills.
6. **Motion:** 2–3 quiet cues (fade/slide tray, soft hover) — no glow pulses. Honor `prefers-reduced-motion`.

## Product non-negotiables (inherited)

- Plain CSS; `--site-*` tokens; light **and** dark must both feel intentional.
- Theme: `eduardoos-theme` + `html[data-theme]` / `html.dark`.
- Activity bar icons: `currentColor` / token fg — legible in both themes.
- Do not break Music / Pamphlet / APS tool density for ornament.
- Agent identity copy: still follow `agent-voice` (AI agent, never impersonate Eduardo).

## Anti-patterns (this skill)

- Dense blueprint grid wash that reads as “cyber / hacker.”
- Dashboard-first home (tool strips, metric cards, promo chips in the hero).
- Purple gradients, cream + terracotta serif defaults, broadsheet newspaper columns.
- Glow stacks, rounded-full pill clusters, emoji chrome.
- Display serif on every heading — brand and select titles only.

## Quick self-check before shipping

1. Remove the nav: does the first viewport still feel like Eduardo OS / AEC atelier?
2. Does dark mode feel like an evening gallery — or a terminal?
3. Would this look like generic AI SaaS if you swapped the name? If yes, refine tokens/type.
4. Are Music/Pamphlet/APS still readable and dense where they need to be?
