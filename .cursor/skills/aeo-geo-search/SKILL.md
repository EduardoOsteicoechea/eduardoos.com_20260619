---
name: aeo-geo-search
description: >-
  Answer Engine Optimization (AEO) and Generative Engine Optimization (GEO) for
  Eduardo OS marketing pages. Use when writing specs or coding landing, about,
  profile, or FAQ surfaces meant to rank and be cited by ChatGPT, Claude, Grok,
  Gemini, Perplexity, Google AI Overviews, and classic Google Search.
---

# AEO / GEO for Eduardo OS (LLM + Google)

Optimize for **citation inside AI answers** and **classic search**, not keyword stuffing.
Pair with `elegant-formal-ui` + `frontend-design` for visuals; this skill owns **information architecture, HTML semantics, and machine-readable facts**.

## Goal (what “rank #1” means here)

1. Engines can extract a **correct, quotable answer** about Eduardo Osteicoechea / Eduardo OS.
2. The page is the **canonical entity home** (consistent name, roles, `sameAs` links).
3. Claims are **crawlable in HTML** (SSR Astro), not trapped only in client JS or images.

Never promise guaranteed #1 rankings. Ship the strongest citable structure; measure via Search Console + prompt panels later.

## Spec checklist (agents MUST put these in `specs/**` before coding)

- [ ] **Primary entity** named once in H1/brand area (already on home hero — do not duplicate a competing H1).
- [ ] **Answer capsules**: every major H2 opens with 40–60 words that answer the heading alone.
- [ ] **Question-shaped H2s** where natural (“Who is…?”, “What does…?”, “How to contact…?”).
- [ ] **One claim per short paragraph** (≈60–100 words max).
- [ ] **Visible facts match JSON-LD** (no schema-only secrets).
- [ ] **`sameAs`**: LinkedIn, GitHub, YouTube, site — exact public URLs from `PROFILE_CONTEXT.md`.
- [ ] **FAQ block** (≥3 real Q&As) + `FAQPage` JSON-LD.
- [ ] **Person** (and optional `ProfessionalService`) JSON-LD with `jobTitle`, `knowsAbout`, `alumniOf`, `worksFor` when accurate.
- [ ] **Privacy**: Venezuela-only residence if mentioned; never family; do not volunteer birth date on marketing pages.
- [ ] **Canonical URL** + meta description that restates the entity in plain language.
- [ ] Optional: `/llms.txt` short machine summary pointing at the profile section anchors.

## HTML / Astro coding rules

1. **Server-rendered** semantic sections (`section`, `h2`–`h3`, `dl`/`ul`, `time` where useful).
2. **Stable `id` anchors** on each section for citation deep-links (`#who`, `#experience`, …).
3. **JSON-LD** in `<script type="application/ld+json">` via `@graph` when stacking Person + FAQPage + WebPage.
4. Prefer **plain CSS**; readable panels over photography (`color-mix` / surface tokens) so extractors and humans both see text.
5. **Internal links** to Contact, LinkedIn (`rel="noopener noreferrer"` on external).
6. Do **not** hide primary facts behind tabs or “read more” that require JS.
7. Keep **hero composition untouched** unless the spec explicitly changes it; add AEO body **below** the first viewport.
8. Language: match the page `lang` (home is `en`); do not mix untranslated Spanish blocks into English entity pages unless the spec asks for bilingual.

## Content sources (priority)

1. `backend/internal/contact/PROFILE_CONTEXT.md` §2 (facts) — rewrite only for clarity, not invention.
2. Public contact block in §1.
3. Never invent employers, dates, degrees, or metrics.

## Anti-patterns

- Keyword walls, fake testimonials, fabricated stats.
- Schema that disagrees with visible copy.
- Putting the entire biography only in PDF/image.
- First-person impersonation of Eduardo on marketing copy (third person or brand voice).
- Purple SaaS / cream-terracotta / broadsheet pastiche (see elegant-formal-ui).

## Acceptance smoke

- View-source shows profile headings and FAQ text without waiting for hydration.
- Rich Results / schema validator would accept Person + FAQPage (no errors on required fields).
- LinkedIn appears as a real `<a href="https://www.linkedin.com/in/eduardoosteicoechea">`.
