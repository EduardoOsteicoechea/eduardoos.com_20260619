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
3. **Fixed AI panel (desktop ≥960px only)** — `.home-hero__chat` stays `position: fixed` with z-index above dossier; mobile/tablet unchanged (chat hidden below 960px).
4. **Structured public profile** below the hero (first person on page; FAQ questions natural-language for AEO). LinkedIn included.
5. **AEO/GEO** — Person+FAQPage+WebPage JSON-LD; `/llms.txt`.
6. Visual language: plain CSS; light/dark via `--site-*` / 045 tokens.

## Acceptance

- [x] Hero has no background/portrait image; copy + agent composition only.
- [x] Chat always paints above scrolling profile cards.
- [x] Profile cards two-per-row; direct first-person section titles.
- [x] Desktop AI chat fixed while profile scrolls; hidden below 960px as before.
- [x] SSR HTML contains sections + FAQ; JSON-LD `@graph` on home; LinkedIn link present.
- [x] FE build green; commit+push.
