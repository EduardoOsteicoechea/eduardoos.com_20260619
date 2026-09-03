# Feature 065 — Shared view loading indicator

## Problem

When a product view is loading (especially `ServiceGate` and hub fetches), a plain left-aligned text string (“Checking subscription…”, “Loading…”, “Cargando…”) sticks to the page margin and looks unfinished.

## Goals

1. Shared **`ViewLoading`** React component + plain CSS (no Tailwind / no shadcn dependency — site already loads **Material Symbols Outlined**).
2. Visual: centered **spinning** Material Symbol `progress_activity` (accent color) + optional short muted label under it (accessible `role="status"` / `aria-busy`).
3. Replace view-level loading placeholders that are currently bare `<p>…</p>` left-aligned, starting with:
   - `ServiceGate` (gates most product routes)
   - Major hubs: eReport hub/invite/editor gate, Scrib dashboard, Church hubs, Homescool list/learning, Articles list/view, Pamphlet page, Profile image, Admin users, Playlist library, BIM viewer gate, Calvin reader statuses used as full-pane loads
4. Respect `prefers-reduced-motion`: icon stays static (no spin).
5. Button busy labels (“Working…”, “Preparing…”) stay text — out of scope.

## Non-goals

- Adding shadcn / Tailwind.
- Animated GIF assets from CDN.
- Rewriting every inline modal micro-status (Institutes “Loading Capita…” may keep compact text or use a compact variant later).

## Acceptance

- [x] `ViewLoading` ships under `frontend/src/components/ViewLoading/`
- [x] ServiceGate loading uses centered spinner (no left-margin orphan text)
- [x] Listed hubs use `ViewLoading` for full-view loads
- [x] FE build; commit + push

## Affected paths

- `specs/065-view-loading-indicator/spec.md`
- `frontend/src/components/ViewLoading/**`
- `frontend/src/components/ServiceGate/**`
- Product hub components listed above
- `.memory/MILESTONE-*.md`
