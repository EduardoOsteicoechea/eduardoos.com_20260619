# Milestone — Footer pad_bottom 0 + Dirección/Actividades pads (2026-08-19)

## Change
- Outer footer `pad_bottom: 0` (keep `pad_top` / horizontal `1.2`).
- Second labels row: `meta_label2_row_h: 6.5` (+1mm bottom vs meta_row_h); `meta_label2_pad_top: 1.2` (+0.5 inside the cell — **no** footer height growth).
- Band height **29.8**; page1 left col **160.1**, body **120.6**.

## Paths
- `specs/007-pamphlet-footer-spacing/spec.md`
- `frontend/src/lib/pamphlet-generator/src/{pamphlet_schema.ts,style.css,main.ts}`
- `backend/pkg/pdf/{pamphlet.go,pamphlet_test.go}`
