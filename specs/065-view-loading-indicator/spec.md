# Feature 065 — Shared view loading indicator

## Problem

When a product view (or pane) is loading, a plain left-aligned text string (“Checking subscription…”, “Loading…”, “Cargando hoja…”, “Cargando historial…”) sticks to the margin and looks unfinished. Pass 1 covered ServiceGate + major hubs; **Scrib sheet editor and other routes still show bare text.**

## Goals

1. Shared **`ViewLoading`** React component + plain CSS (no Tailwind / no shadcn — site already loads **Material Symbols Outlined**).
2. Visual: centered **spinning** Material Symbol `progress_activity` (accent) + optional muted label (`role="status"` / `aria-busy`).
3. **`compact` variant** for modals / side panes / lyrics (smaller min-height, still centered — not full viewport).
4. Replace **every** user-visible loading placeholder that is bare left-stuck text, including:
   - `ServiceGate`, Church gates (`ChurchGate`, Groups/Leaders checking access)
   - Scrib: **dashboard**, **sheet editor (“Cargando hoja…”)**, Institutes modal Capita/paragraphs loads
   - eReport hub/invite/editor + Historial modal “Cargando historial…”
   - Homescool, Church hubs, Articles, Pamphlet React list, Profile image + **API keys gate**, Admin users access check + list
   - Playlist library + **lyrics “Cargando…”**
   - BIM viewer gate, Calvin reader pane loads
   - Pamphlet generator vanilla hints that say “Cargando…” / “Loading tree…” (same visual language: Material icon + centered hint)
5. Respect `prefers-reduced-motion`: icon static (no spin).
6. Button busy labels (“Working…”, “Preparing…”, “Saving…”) stay text — out of scope.
7. Empty / idle copy (“Select a chapter”, “No tracks”) stays text — not a loading state.

## Non-goals

- Adding shadcn / Tailwind.
- Animated GIF assets from CDN.
- Replacing button labels or log lines (AgentSandbox boot logs).

## Acceptance

- [x] `ViewLoading` under `frontend/src/components/ViewLoading/` (+ `compact` prop)
- [x] ServiceGate + listed hubs use spinner
- [x] Scrib sheet editor uses `ViewLoading` (no “Cargando hoja…”)
- [x] Remaining bare loading strings in React product UI (gates, modals, lyrics, historial, API keys) use `ViewLoading` / compact
- [x] Pamphlet vanilla cloud/tree loading hints match spinner language
- [x] FE build; commit + push

## Affected paths

- `specs/065-view-loading-indicator/spec.md`
- `frontend/src/components/ViewLoading/**`
- Scrib, Church gates, eReport header modal, Playlist lyrics, Admin/Profile API keys, pamphlet generator hints
- `.memory/MILESTONE-*.md`
