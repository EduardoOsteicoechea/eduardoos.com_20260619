# Feature 049 — eReport tracker sync to reporte_qa_populado

## Status

**Done** (2026-09-01).

## Problem

`frontend/public/ereport-tracker.html` (the eReport **report** editor iframe) is still an older fork. Canonical QA UI/UX lives in:

`c:\Users\eduar\Documents\work\eteller\integration\model-checker-buenos-aires\CurrentTask\reporte_qa_populado.html`

Spec 046 claimed a site-token restyle; the live tracker still lacks the populado styles and behaviors (Material Icons topbar, sticky section/group heads, wider nav rail, collapse hierarchy, inplace editors, `no_aplica` status, tutorial + progress/save modals, etc.).

## Goals (locked)

1. **Replace** `ereport-tracker.html` (and alias `ereport/tracker.html`) with the populado tracker **styles + functionality**.
2. **Default visual:** populado palette (light/dark black–white QA tokens), Material Icons, sticky section/subsection headers, 24.5rem sidebar, collapse chevrons, inplace click-to-edit, status trio including **no_aplica**, howto modal, progress/save modal (footer progress bar removed in favor of modal).
3. **Preserve Eduardo OS integration:**
   - Host `postMessage` bridge (`source`/`target`: `ereport-tracker`) — `booted`, `load`, `loaded`, `collect`/`state`, `cloud-save`, `theme`, `error`.
   - Meta fields **Organization** (`orgName`) + **Report name** (`reportName` / `appTitle`) in addition to date + number.
   - Empty default embedded skeleton (generic sections), **not** the Model BA populated C20MCB content.
4. Cache-bust iframe `?v=` in `EreportEditor.tsx`.
5. Existing `.ereport` payloads with `sections[]` continue to load (backward compatible `normalizeState` / `normalizeItem`).

## Non-goals

- Changing hub/org dashboards, invites, or S3 API shapes.
- Shipping the sample Model BA populado text as the default new-report body.
- Re-applying Eduardo OS teal/045 “host theme” overrides that diverge from populado look (046 hybrid is superseded for the tracker canvas).

## Acceptance

- [x] Tracker HTML matches populado UX (icons, sticky heads, modals, collapse, `no_aplica`, inplace)
- [x] Host bridge still cloud-saves and loads from parent
- [x] Org + report name fields still bind into payload
- [x] Empty skeleton (no Model BA sample)
- [x] Alias `/ereport/tracker.html` synced; cache bust; FE build; commit/push

## Affected paths

- `specs/049-ereport-tracker-populado/spec.md`
- `frontend/public/ereport-tracker.html`
- `frontend/public/ereport/tracker.html`
- `frontend/src/components/Ereport/EreportEditor.tsx`
- `.memory/MILESTONE-*.md`
