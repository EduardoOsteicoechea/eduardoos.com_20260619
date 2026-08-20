# Milestone — Footer pad_bottom 0 + Dirección/Actividades +1mm (2026-08-19)

## Change
- Outer footer `pad_bottom: 0` (keep `pad_top` / horizontal `1.2`).
- Second labels row (Dirección/Actividades): `meta_label2_row_h: 6.5` (+1mm bottom).
- Band height **29.8** absorbs net (−1.2 + 1); page1 left col **160.1**, body **120.6**.

## Paths
- `specs/007-pamphlet-footer-spacing/spec.md`
- `frontend/src/lib/pamphlet-generator/src/{pamphlet_schema.ts,style.css,main.ts}`
- `backend/pkg/pdf/{pamphlet.go,pamphlet_test.go}`
