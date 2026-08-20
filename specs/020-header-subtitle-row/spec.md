# Feature 020 — Header subtitle row (footer-message analogue)

## Problem

Header jumps from title+divider straight to the 2×2 meta bar. Users need a short subtitle / key-metadata paragraph (editable `p`), like footer Mensaje under Acción.

## Goals

1. Show `header.subtitle` between the title divider and the meta bar (already in schema/persistence; stop hiding it).
2. Style as a message-like `p` row (Roboto, ~footer message size); editable tray unchanged.
3. Grow header band to fit: `height` **30 → 35** mm; add `subtitle_*` mm to `PAMPHLET_HEADER_LAYOUT_MM` / CSS / PDF `PamphletHeaderLayout`.
4. Recalc `--page1-right-col-height` / Go `PamphletPage1RightColMm` / page1 body (cols 1–2 shorter).
5. PDF `drawHeader` paints subtitle after the title divider, before meta.

## Non-goals

- Changing title type size or meta 2×2 fields.
- Renaming the JSON key (`subtitle` stays).

## Acceptance

- [x] Subtitle visible + editable + saved in `.epam`.
- [x] Desktop band 35mm; cols 1–2 height updated; PDF matches; tests + FE build green.

## Revision 2026-08-19 (subtitle flush + meta top rule)

- [x] Subtitle `padding-left` / `subtitle_pad_x` = **0** (flush with title left edge).
- [x] Gray hairline on top of the 2×2 meta bar (same language as footer meta top rule); PDF `includeTop` on header meta cross.
