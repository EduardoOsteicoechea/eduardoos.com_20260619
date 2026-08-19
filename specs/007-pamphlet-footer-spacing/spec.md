# Feature 007 — Pamphlet footer outer inset + action→message gap

## Status

Draft — awaiting mm confirmation before implementation.

## Problem

1. On the PDF (and sheet), the footer double frame sits too close to the **page exterior** (left/bottom content edge / page margin).
2. Vertical space between the footer **title** (Acción / bold h1) and the **message** `<p>` below is too tight; need a **double** gap vs today’s single `chrome_gap`.

## Current values (source of truth today)

| Token | mm | Where |
|-------|-----|--------|
| Page margin | 10 | `PamphletMarginMm` / `--page-margin` |
| Footer pad | 1.2 | `PAMPHLET_FOOTER_LAYOUT_MM.pad` |
| Footer chrome_gap | 0.6 | gap between action / message / meta |
| Footer height | 33 | `--page-footer-height` |

## Proposed goals (pending confirmation)

1. **Exterior:** Increase separation between the footer outer stroke and the page edge without breaking the 8-column grid alignment of cols 7–8 above the footer (same horizontal tracks). Preferred approach TBD (see questions).
2. **Title → message:** Introduce dedicated `action_message_gap` = **2 × chrome_gap** (default **1.2mm** if chrome_gap stays 0.6), applied only between Acción and Mensaje; meta gap unchanged unless specified. Desktop CSS + PDF `footer_layout` must stay in lockstep.

## Non-goals

- Changing header band or body column type sizes.
- Removing the double frame chrome.

## Acceptance

- [ ] Desktop footer and PDF match after print (`footer_layout` POSTed).
- [ ] Visible extra space between Acción title and Mensaje paragraph (= double vs previous single gap).
- [ ] Footer frame no longer visually flush against the page exterior (per confirmed mm).
- [ ] Spec mm numbers frozen before code lands.

## Open questions (block coding)

1. **Exterior “muy junto”:** ¿Qué quieres exactamente?
   - **A)** Subir el margen de página entero (`10mm` → p.ej. `12mm` o `14mm`) — afecta header/columnas también.
   - **B)** Solo inset del footer respecto al borde de página (p.ej. margen de página sigue 10mm, pero el footer se dibuja más adentro / más pad exterior) — ¿cuántos mm extras?
2. **“Margen doble” título→p:** ¿Confirmas **1.2mm** (doble de `0.6`) solo entre Acción y Mensaje, dejando el gap hacia la meta en `0.6`?
