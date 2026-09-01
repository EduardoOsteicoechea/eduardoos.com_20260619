# Feature 045 — Global theme tokens + Music / eVoice / Pamphlet dashboards

## Status

**Draft** (2026-09-01) — awaiting color hex lock + confirmation of proposed m/p scales per breakpoint.  
Checkpoint before this work: git `6cdd174`, `.memory/MILESTONE-pre-global-theme-20260901.md`.

## Problem

Site chrome and product hubs still use mixed `--site-*` tokens, rem drift, and borders. Music / eVoice / Pamphlet need a card dashboard at the route base plus section views, without breaking locked mm/px apps (Pamphlet canvas, Scrib).

## Goals (locked so far)

### Typography & root
- Font stack: `Calibri, system-ui, sans-serif`.
- Root font-size: **14px** on `html` (all rem math follows this).
- **Pass-through (do not rem-convert):** Pamphlet document canvas and Scrib sheet/layout that use locked **mm / px** (including 0.5px rules). Spec rule: those dimensions stay absolute; do not “fix” them into rem. Everything else must adhere to the 14px root.

### Spacing tokens (same scale for `--m*` margins and `--p*` paddings)
User lock: step **1 = 0.75rem**, step **5 = 3rem**. Proposed intermediate (linear-ish, round):

| Token | rem |
|---|---|
| `--m1` / `--p1` | `0.75rem` |
| `--m2` / `--p2` | `1.125rem` |
| `--m3` / `--p3` | `1.5rem` |
| `--m4` / `--p4` | `2.25rem` |
| `--m5` / `--p5` | `3rem` |

### Control / chrome sizes
- `--bmh` / `--bmw`: current header control size → **`2.25rem`** (was 2.25rem / ~31.5px at old root; stays `2.25rem` under 14px root ≈ 31.5px).
- `--lbw` (lateral bar width): current 60px → **`4.285714rem`** (`60 / 14`).
- `--br` (border-radius): **TBD** (propose `0.215rem` ≈ 3px at 14px, or `0` if fully square).

### Breakpoint lists (three parallel token sets)
Media queries (propose):
- **Phone:** `max-width: 767.98px`
- **Tablet:** `768px`–`1099.98px`
- **Desktop:** `min-width: 1100px`

Each mode sets its own `--m1`…`--m5`, `--p1`…`--p5`, `--bmh`, `--bmw`, `--lbw`, `--br` (and aliases). Proposed multipliers vs desktop:

| Mode | Scale vs desktop | Notes |
|---|---|---|
| Desktop | 1.0 | values above |
| Tablet | 0.9 | e.g. m1=`0.675rem`, m5=`2.7rem`, bmh/bmw=`2.025rem`, lbw=`3.857rem` |
| Phone | 0.8 | e.g. m1=`0.6rem`, m5=`2.4rem`, bmh/bmw=`1.8rem`, lbw=`0` (top bar, no left rail) |

Phone: `--lbw: 0`; header stays top bar. Desktop/tablet: left rail uses `--lbw`.

### Themes & color
- Only **light** / **dark** (`html[data-theme]`).
- `--bg` application background; `--fg` application foreground.
- Button ISO colors only: **blue, green, yellow, red** (no accent steel unless mapped to blue).
- Hex values: **TBD — user must supply**.

### Borders
- **No borders site-wide**, including header logo, hamburger, trays, cards, inputs, panels.
- Separation via **margin / gap** using `--m*` / `--p*` only.

### Routing decision: `?view=` (recommended, locked unless user overrides)
**Recommendation: use base route + `?view=`** (not nested path segments).

Why:
- One Astro page / one React shell per product; header dynamic buttons swap views without full remount.
- Pretty URLs like `/ereport/{user}/{id}` stay for deep entities; hub sections are UI modes, not documents.
- Back/forward and shareable links still work (`?view=playlists`).
- Avoids nginx rewrite sprawl for every card.

Locked shapes:
- Music: `/media/musica` + `?view=dashboard|playlists|free|rec|upload|letters|manage` (default `dashboard`)
- eVoice: `/evoice` + `?view=dashboard|admin|upload|docs|audios|playlists|print|crawl` (default `dashboard`)
- Pamphlet: `/documents/pamphlet` + `?view=dashboard|recent|open|new|manage|footers` (default `dashboard`)

### Music dashboard
Cards (each opens `?view=`): Playlists, Free Select, Record, Upload, Set letters, Manage Songs.  
Header dynamic buttons: Dashboard, Playlist, Free, Rec, Up, Letters, Manage.

**Upload view:** two option cards:
1. Upload a **new** song end-to-end (current admin upload flow).
2. Select an **existing** song and save a **v2** of the same.

### eVoice dashboard
Cards: Admin, Upload, Manage documents, Manage audios, Playlists, Print documents, Crawl (URL).  
Header dynamic: Dashboard + short labels for each section.

**Crawl mode:**
1. User enters a **URL**.
2. Server **validates the URL is real/reachable** before work starts (fail fast if not).
3. Fetch/crawl page text.
4. Pass through cleaner → **DeepSeek** rewrites/cleans text for the TTS pipeline (not HTML rendering).
5. Result is treated like any other eVoice source: **save doc under project** + **generate and store audio** (same S3 docs/audios rules as upload/paste).

### Pamphlet dashboard
Cards: Recent, Open, New, Manage, Footers.  
Header dynamic: matching short labels.  
**Pamphlet mm/px canvas stays pass-through** (no rem conversion of locked layout).

## Non-goals
- Changing Scrib or Pamphlet mm/px geometry.
- Nested `/media/musica/playlists` path segments (unless user overrides `?view=`).
- HTML-from-DeepSeek / render-HTML crawl path (explicitly dropped).
- Extra themes beyond light/dark.

## Acceptance (when colors + scales confirmed)
- [ ] `theme.css` defines root 14px, Calibri/system-ui, `--m*`/`--p*`/`--bmh`/`--bmw`/`--lbw`/`--br`/`--bg`/`--fg` + ISO button colors; three breakpoint blocks
- [ ] No borders on chrome/containers site-wide (header included)
- [ ] Pamphlet + Scrib locked dimensions untouched
- [ ] Music / eVoice / Pamphlet dashboards + `?view=` + header dynamic buttons
- [ ] Music Upload = new vs v2 cards
- [ ] eVoice crawl: validate URL → clean → DeepSeek TTS text → save doc + audio
- [ ] FE build + commit/push

## Affected paths (planned)
- `specs/045-global-theme-product-dashboards/spec.md`
- `frontend/src/styles/theme.css`, `global.css`, `buttons.css`, `chrome.css`, Header CSS
- `frontend/src/components/{PlaylistBuilder,Evoice,Pamphlet}/**` (dashboards + views)
- `backend/internal/evoice/**` (crawl + validate URL)
- `.memory/MILESTONE-*.md`

## Open questions (block implementation)
1. Confirm m2–m4 / p2–p4 table and tablet/phone multipliers above (or paste your three full lists).
2. Hex for light/dark `--bg`, `--fg`, and button blue/green/yellow/red (+ hover if any).
3. `--br` value (or `0`).
4. Confirm `?view=` (recommended) vs nested paths.
