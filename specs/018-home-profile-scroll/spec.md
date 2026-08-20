# Feature 018 — Home profile dossier under hero (fixed portrait + AEO)

## Problem

Profile/RAG facts live in `PROFILE_CONTEXT.md` for agents but visitors only see the hero. Need a scrollable, citable professional dossier under the existing hero without changing the first-viewport composition.

## Goals

1. **Keep hero perfect** — brand, role line, lead, Contact CTA, agent panel, portrait crop unchanged in the first viewport.
2. **Fixed portrait** — the hero photo stays visually fixed while the page scrolls; dossier text scrolls over readable surface panels.
3. **Structured public profile** below the hero from `PROFILE_CONTEXT.md` §2 + public contact (third person). Include LinkedIn `https://www.linkedin.com/in/eduardoosteicoechea`.
4. **AEO/GEO** — follow `.cursor/skills/aeo-geo-search/SKILL.md`: answer capsules, question H2s, FAQ, Person+FAQPage+WebPage JSON-LD `@graph`, `sameAs`, `/llms.txt`, no birth-date volunteer, no family, Venezuela-only if residence mentioned.
5. Visual language: `elegant-formal-ui` + plain CSS component file; light/dark via `--site-*`.

## Non-goals

- Changing hero copy/layout/chat behavior.
- Vector RAG or new APIs.
- Publishing agent guardrail/prompt internals on the marketing page.
- Impersonating Eduardo in first person.

## Information architecture (anchors)

| id | Section |
|----|---------|
| `#who` | Who is Eduardo Osteicoechea? |
| `#expertise` | What does he specialize in? |
| `#education` | Education & training |
| `#experience` | Professional experience |
| `#skills` | Skills & technical stack |
| `#focus` | Current focus |
| `#contact-profile` | How to reach him (email, WhatsApp, LinkedIn, GitHub, YouTube) |
| `#faq` | FAQ (AEO) |

## Acceptance

- [x] Hero first viewport unchanged in structure/intent.
- [x] Portrait fixed on scroll; dossier readable in light/dark.
- [x] SSR HTML contains sections + FAQ; JSON-LD `@graph` on home; LinkedIn link present.
- [x] `public/llms.txt` summarizes entity + points to `/#who`.
- [x] FE `npm run build` green; commit+push.
