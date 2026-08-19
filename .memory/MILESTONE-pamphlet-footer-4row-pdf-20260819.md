# Milestone: Pamphlet footer 4-row meta + PDF frame — 2026-08-19

## Desktop

- Meta grid is **4 rows × 2 cells**: `label1|label2`, `value1|value2`, `label3|label4`, `value3|value4`.
- Frame: `border: 0.2mm`, `border-radius: 1mm`.
- Acción/Mensaje: `overflow: hidden` + word-wrap so long lines (e.g. “contáctanos:”) stay inside the frame.
- Sheet (`desktop`): `overflow: hidden` so column ink does not bleed into the activity-bar gutter.
- Meta cells taller (~5.5mm) and slightly larger type (2.8mm).

## PDF

- Rounded 1mm frame, 1.4mm pad, 4×2 meta with **5.5mm** row height matching desktop.
