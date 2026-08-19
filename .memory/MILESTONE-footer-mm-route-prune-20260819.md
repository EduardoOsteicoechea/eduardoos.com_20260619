# Milestone: Footer mm contract + route prune — 2026-08-19

## Footer
- Exhaustive `PAMPHLET_FOOTER_LAYOUT_MM` (height/width/pad/strokes/divider/action/message/meta).
- Print POSTs `footer_layout`; PDF `drawFooter` consumes layout only (uses `layout.Width`).
- Empty meta value rows hidden (desktop `data-empty` + PDF skip).
- Double horizontal rule Acción→Mensaje (`divider_*` mm), same language as footer frame.
- Outer page margin / footer band placement unchanged (milestone locked).

## Route prune
KEEP: Home, Contact, Homescool, Church, Music, Pamphlet, Articles, auth, admin, Subscribe.
DELETE: BIM, APS Admin, Debate/edebat, Instrumentalist, Greek, Media Gallery (+ Videos catalog).
- FE pages/libs/deps removed; nginx greek rewrite removed; payments catalog aligned.
- `npm run build` → 25 pages; `go test` green for remaining packages.
