# Feature 019 — Double gray frame on header/footer meta sections

## Goals

1. Header lower section (`.pamphlet-header-meta-bar`): **double gray margin/frame** (outer 0.2mm + inset 0.45mm + inner 0.1mm), gray `#666`, matching the annotation around Serie/Capítulo/Autor/Fecha.
2. Footer lower section (`.pamphlet-footer-meta-bar`): same double gray frame around WhatsApp/Teléfono/Dirección/Actividades.
3. **Do not change** header or footer band heights / `title_meta_gap` / layout mm constants. Frames are overlay (`position: absolute` / PDF stroke after paint) so box sizes stay the same.
4. PDF `drawHeader` / `drawFooter` paint the same gray double frame around the meta region.

## Non-goals

- Cell/grid hairlines inside the meta 2×2 (annotation-only in the sketch).
- Changing Acción/Mensaje or title chrome.

## Acceptance

- [x] Desktop CSS double gray frame on both meta bars; heights unchanged.
- [x] PDF strokes gray double frame; tests green; FE build; commit+push.
