# Milestone: Pamphlet footer 4-row meta + PDF frame — 2026-08-19

## Desktop

- Meta grid is **4 rows × 2 cells**: `label1|label2`, `value1|value2`, `label3|label4`, `value3|value4` (no side-by-side label|value wrap).
- Footer frame: `border: 0.2mm solid #222`, `border-radius: 1mm`.

## PDF

- `drawFooter` strokes a 1mm-radius rounded rect (0.2mm stroke) with 1.2mm pad.
- Same 4×2 field layout; labels always paint (defaults via `normalizeFooter`); empty values no longer collapse the grid.
