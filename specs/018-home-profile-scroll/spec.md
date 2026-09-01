# Feature 018 — Home profile dossier under hero (fixed portrait + AEO)

## Problem

Profile/RAG facts live in `PROFILE_CONTEXT.md` for agents but visitors only see the hero. Need a scrollable, citable professional dossier under the hero. Hero is copy-first (no portrait backdrop) with CV-grounded headline/lead.

## Goals

1. **Hero first viewport** — brand name, one headline, one lead, Contact (+ LinkedIn) CTAs, agent panel on desktop. **No hero portrait / background photo.**
2. **Hero copy from CV** — concrete facts only (ULA Cum Laude, Master BIM, Avant Leap / Revit tooling, full-stack + AWS platforms). No fluff like “greenfield rebuild.”
3. **Fixed AI panel (desktop ≥960px only)** — `.home-hero__chat` stays `position: fixed` in its first-viewport slot while the dossier scrolls; mobile/tablet unchanged (chat remains hidden below 960px).
4. **Structured public profile** below the hero from `PROFILE_CONTEXT.md` §2 + public contact (third person). Include LinkedIn `https://www.linkedin.com/in/eduardoosteicoechea`.
5. **AEO/GEO** — follow `.cursor/skills/aeo-geo-search/SKILL.md`: answer capsules, question H2s, FAQ, Person+FAQPage+WebPage JSON-LD `@graph`, `sameAs`, `/llms.txt`, no birth-date volunteer, no family, Venezuela-only if residence mentioned.
6. Visual language: plain CSS; light/dark via `--site-*` / 045 tokens.

## Non-goals

- Restoring a fixed hero portrait.
- Vector RAG or new APIs.
- Publishing agent guardrail/prompt internals on the marketing page.
- Impersonating Eduardo in first person.

## Acceptance

- [x] Hero has no background/portrait image; copy + agent composition only.
- [x] Hero headline/lead grounded in CV facts; meta/`profileWhoAnswer` aligned.
- [x] Desktop AI chat fixed while profile scrolls; hidden below 960px as before.
- [x] SSR HTML contains sections + FAQ; JSON-LD `@graph` on home; LinkedIn link present.
- [x] `public/llms.txt` summarizes entity + points to `/#who`.
- [x] FE `npm run build` green; commit+push.
