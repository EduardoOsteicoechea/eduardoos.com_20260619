# Feature 012 — Header double frame + rule nudge + desktop Acción 2.5mm

## Goals

1. Header bottom double rule **1mm higher** (`rule_clearance`: 2 → **1**). Desktop + PDF via `header_layout`.
2. **Full header chrome** like footer: outer border + thinner inner frame (`pad`, `stroke`, `radius`, `inner_inset`, `inner_stroke`, `inner_radius`). Keep bottom double rule inside the band. PDF `drawHeader` paints the same frame.
3. Desktop Acción title **2.5mm** (was 2.8mm). Do not change `PAMPHLET_FOOTER_LAYOUT_MM.action_size` (PDF unchanged).

## Acceptance

- [x] `rule_clearance` 1mm; header frame tokens in FE+PDF; desktop Acción 2.5mm; tests/build green.
