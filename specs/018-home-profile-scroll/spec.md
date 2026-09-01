# Feature 018 — Home profile dossier under hero (fixed portrait + AEO)

## Problem

Profile/RAG facts live in `PROFILE_CONTEXT.md` for agents but visitors only see the hero. Need a scrollable, citable professional dossier under the hero. Hero is copy-first (no portrait backdrop) with CV-grounded headline/lead.

## Goals

1. **Hero first viewport** — brand name, one headline, one lead, Contact (+ LinkedIn) CTAs, agent panel on desktop. **No hero portrait / background photo.** Chat panel stays **always on top** of the scrolling dossier (no stacking-context trap).
2. **Hero + dossier copy** — first person, CV facts, AI-driven development enthusiasm. Section titles direct: Profile, Specialization, Education and Training, Professional Experience, Skills and Stack, Focus, Contact, FAQ. **Two cards per row** on tablet+.
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
