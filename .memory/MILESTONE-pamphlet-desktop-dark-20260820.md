# Milestone — Pamphlet desktop dark mode + label2 pad top 1mm (2026-08-20)

## Change
- Screen pamphlet ink tokens: `--pamphlet-paper-bg` / `--pamphlet-ink` / `--pamphlet-rule` → site body bg/fg.
- **Fix:** `PamphletLayout.css` had forced `#fff/#000` on `main.pamphlet-sheet` (beat generator CSS); now uses pamphlet tokens so columns/body match dark mode.
- Print overrides tokens to white/black; PDF unchanged.
- Dirección/Actividades `meta_label2_pad_top: 1`.

## Spec
- `specs/022-pamphlet-desktop-dark/spec.md`
