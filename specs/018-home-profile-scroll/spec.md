# Feature 018 — Home profile dossier under hero (fixed portrait + AEO)

## Problem

Profile/RAG facts live in `PROFILE_CONTEXT.md` for agents but visitors only see the hero. Need a scrollable, citable professional dossier under the hero. Hero is copy-first (no portrait backdrop) with CV-grounded headline/lead.

## Goals

1. **Hero first viewport** — brand name, one headline, one lead, Contact (+ LinkedIn) CTAs, agent panel on desktop. **No hero portrait / background photo.** Chat panel stays **always on top** of the scrolling dossier (no stacking-context trap).
2. **Hero + dossier layout (desktop)** — shared column width: agent width equals one info column (`--home-col` in a 3-column shell). Grid:
   - Profile | Specialization (1+1)
   - Education and Training (span 2)
   - Professional Experience: 4-column job cards
   - Skills and Stack (span 2): inner 6 skill cards with brief descriptions
   - FAQ: 3 columns
   - Focus | Contact (1+1)
   First-person copy; AI-driven enthusiasm.
3. **Sticky AI panel (desktop ≥960px only)** — `.home-hero__chat` is **`position: sticky`** (not `relative` / not scrolled away) with `top` under site chrome and z-index above the dossier; it stays visible while the dossier scrolls. Mobile/tablet: chat hidden below 960px. **Gutter:** dossier ↔ agent uses the same `--home-gap` as Profile↔Specialization (see `specs/047-home-agent-gap-cards-icons/spec.md`). Dock title: **Talk To Assistant**. Do **not** set `position: relative` on `.home-hero__chat` at a higher specificity that overrides sticky.
4. **Structured public profile** below the hero (first person on page; FAQ questions natural-language for AEO). LinkedIn included. Experience + Skills sections are flat (no section bg/padding); cards equal height; Material Symbol icons on sections and cards.
5. **AEO/GEO** — Person+FAQPage+WebPage JSON-LD; `/llms.txt`.
6. Visual language: plain CSS; light/dark via `--site-*` / 045 tokens.

## Acceptance

- [x] Hero has no background/portrait image; copy + agent composition only.
- [x] Chat always paints above scrolling profile cards.
- [x] Profile cards two-per-row; direct first-person section titles.
- [x] Desktop AI chat sticky while profile scrolls; hidden below 960px as before.
- [x] SSR HTML contains sections + FAQ; JSON-LD `@graph` on home; LinkedIn link present.
- [x] FE build green; commit+push.
