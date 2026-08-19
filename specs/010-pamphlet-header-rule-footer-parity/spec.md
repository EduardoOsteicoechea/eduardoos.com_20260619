# Feature 010 — EC2 runbook home + pamphlet header rule + footer desktop/PDF height parity

## Status

Ready to implement (clarified 2026-08-19).

## Goals

### 1. EC2 runbook location
- Move root `EC2-AMAZON-LINUX-SETUP.txt` to [`deploy/ec2/AMAZON-LINUX-SETUP.md`](../../deploy/ec2/AMAZON-LINUX-SETUP.md) (semantic home next to deploy scripts).
- Link it from README EC2 section.
- Delete the root `.txt`. Do not remove or change `docker-compose.yml` / `docker-compose.ec2.yml`.

### 2. Header bottom rule (like footer divider), no extra margin
- Desktop `.pamphlet-page-header` gets a **double horizontal rule** at the **bottom edge of the header band**, same language as `.pamphlet-footer-divider` / footer frame (`outer stroke` + gap + `inner stroke`).
- Tokens live in `PAMPHLET_HEADER_LAYOUT_MM` (`rule_outer_stroke`, `rule_gap`, `rule_inner_stroke`).
- PDF `drawHeader` paints the same rule from `header_layout` (at the bottom of the header band).
- **Do not** increase `--header-body-gutter` / `body_gutter`. The rule sits inside the existing header track (no added margin below the header).

### 3. Footer: make desktop match PDF heights
PDF footer is the visual target. Desktop currently lets Acción/Mensaje grow (`flex: 0 0 auto`) until meta labels crush against the bottom border inside a fixed `30mm` band.

- Meta bar + divider stay **non-shrinking** (`flex: 0 0 auto`).
- Acción / Mensaje may shrink (`flex: 0 1 auto`) with `overflow: hidden` and keep `min-height` from layout (`action_min_h` / `message_min_h`) so meta rows always keep `meta_row_h` space — same floor reservation as PDF.
- CSS continues to use the mm values from `PAMPHLET_FOOTER_LAYOUT_MM` (pad, gaps, row heights, divider). Print still POSTs that object; PDF still consumes only those values.
- Do not invent parallel geometry in Go.

## Non-goals

- Changing outer page margins / footer band placement relative to the page.
- Vector RAG or agent corpus changes.
- Removing docker-compose files.

## Acceptance

- [x] `deploy/ec2/AMAZON-LINUX-SETUP.md` exists; root `EC2-AMAZON-LINUX-SETUP.txt` gone; README links the md.
- [x] Header shows footer-style double bottom rule on desktop + PDF; `body_gutter` unchanged.
- [x] Desktop footer meta labels are not crushed; Acción/Mensaje yield space before meta; PDF still uses posted `footer_layout`.
- [x] `go test ./pkg/pdf/...` + frontend build green when FE changed.
