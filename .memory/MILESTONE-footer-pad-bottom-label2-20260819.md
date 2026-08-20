# Milestone — Footer pad_bottom 0 + Dirección/Actividades pads (2026-08-19)

## Change
- Outer footer `pad_bottom: 0` (keep `pad_top` / horizontal `1.2`).
- Second labels row (Dirección/Actividades): `meta_label2_row_h: 7.0` (+1mm bottom, +0.5mm top); `meta_label2_pad_top: 1.2`.
- Band height **30.3**; page1 left col **159.6**, body **120.1**.

## Paths
- `specs/007-pamphlet-footer-spacing/spec.md`
- `frontend/src/lib/pamphlet-generator/src/{pamphlet_schema.ts,style.css,main.ts}`
- `backend/pkg/pdf/{pamphlet.go,pamphlet_test.go}`
