# Feature 035 — Home tablet/phone chrome, pamphlet overflow, articles meta

## Goals

1. **Home tablet only:** Portrait stays `position: fixed` (does not scroll with dossier). Gradient / face coverage uses **right-top** (not left-top) in the tablet band (`768px`–`959px`).
2. **Home phone only:** Header avatar + hamburger match other routes’ phone inset (collapse empty dynamic slot; bar-end not forced oddly).
3. **Pamphlet desktop columns:** Edit trays and activity (“+”) controls must not be clipped — `overflow: visible` on sheet/column/item while trays are open. **Regression:** body-column trays still got clipped or covered by following items despite `:has(.element_edit_tray)` overflow overrides; desktop must keep the full `.element_edit_tray` (buttons + textarea/image controls) painted above sibling ink via overflow unlock on **all** body columns while any tray is open, plus elevated `z-index` on the editing column/item.
4. **Structured pamphlet:** Switching to `pamphlet_structured_images` must **not delete** body text that no longer fits. Keep items in columns 1–8; clip only via CSS `overflow`. Reflow must not create/discard column 9+.
5. **Pamphlet mobile view:** Hide column borders (`border: none` on `.dumb-column` in `data-view-mode="mobile"`).
6. **Articles detail:** Stronger visual separation between header meta/subtitle (`.article-view__meta`) and body paragraphs for light and dark themes.

## Non-goals

- Changing desktop (≥960) home hero composition.
- OpenCascade / IFC / Python admin console (see feature 036 — pending clarification).
- Changing pamphlet PDF geometry.

## Acceptance

- [x] Tablet home: photo fixed; right-top scrim/object-position.
- [x] Phone home: header controls aligned like pamphlet phone bar.
- [x] Desktop pamphlet: tray + add-item visible outside column bounds when editing.
- [x] Desktop body columns only: full `.element_edit_tray` always visible while open (not clipped by column `overflow: clip` / covered by later `.pamphlet-item`s). Header/footer chrome unchanged.
- [x] Structured toggle: item count preserved; no phantom col 9 drop on save.
- [x] Mobile pamphlet: no column borders.
- [x] Article meta reads clearly distinct from body in both themes.

## Affected paths

- `specs/035-home-pamphlet-articles-ux/spec.md`
- `frontend/src/styles/pages.css`, `global.css` (optional wash)
- `frontend/src/components/Header/Header.css`
- `frontend/src/lib/pamphlet-generator/src/style.css`, `main.ts`
- `frontend/src/components/Articles/ArticleView.css`
- `frontend/src/layouts/PamphletLayout.css` (if borders overridden there)
