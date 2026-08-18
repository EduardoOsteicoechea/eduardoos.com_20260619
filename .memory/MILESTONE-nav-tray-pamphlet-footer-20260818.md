# Milestone: Nav tray chrome + pamphlet footer restore — 2026-08-18

## Status: SHIPPED (this commit)

## 1. Main menu tray header

Inside `.site-header__nav`:

| Control (L→R) | Action |
|---------------|--------|
| **A+** | Increase site text scale (`--site-text-scale`) |
| **A−** | Decrease site text scale |
| Theme | Sun/moon toggle (moved from bottom Theme row) |
| **×** | Close tray (far right) |

- Removed redundant **Home** link (logo still goes home)
- Removed bottom **Theme** row
- Scale helpers: `frontend/src/lib/uiScale.ts` + bootstrap in `BaseLayout.astro`
- `global.css`: `html { font-size: calc(100% * var(--site-text-scale, 1)); }`

## 2. Pamphlet footer: first item deleted when adding a second

**Root cause:** `placeFooterAddButton` → `measureBlockMm` saved `item.nextSibling` (the spacer) as the restore anchor, then `measureBlockInSandbox` moved **both** item and spacer into the measure root. Restore `insertBefore(item, spacer)` failed because spacer was no longer a child of the footer — the first footer item (the one with a trailing spacer) stayed stranded in `.pamphlet-measure-root`. After serialize, it looked deleted.

**Fix:** Anchor = node **after** the `(item + spacer)` block (`spacer.nextSibling`), then re-insert item then spacer before that anchor.

Also renamed footer class `pamphlet-footer-column` → `pamphlet-footer-region` so it never substring-matches `[class*='pamphlet-column-']` reflow selectors.

## Also in this change set

Homescool calendar frequency / shared task state / learning-home layout (prior uncommitted work).
