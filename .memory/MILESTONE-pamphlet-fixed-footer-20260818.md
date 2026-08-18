# Milestone: Pamphlet fixed footer chrome — 2026-08-18

## Status: SHIPPED

## Footer schema (fixed, like header)

```json
"footer": {
  "action": "",
  "message": "",
  "whatsapp": "",
  "phone": "",
  "address": "",
  "activities": ""
}
```

- **Acción** = heading · **Mensaje** = paragraph
- Meta 2×2 (band width = cols 7+8): WhatsApp | Teléfono / Dirección | Actividades
- Legacy `footer.items[]` migrates on open / PDF normalize

## Edit UX

- Desktop: labeled fields with the same edit-tray pattern as header meta
- No more `+` / free-form items in the footer
- Mobile view: full-width normal inputs for
  - Header: Título, Serie, Capítulo, Autor (Fecha hidden)
  - Footer: Acción, Mensaje, WhatsApp, Teléfono, Dirección, Actividades

## PDF ↔ desktop size parity

Footer type now uses mm matching PDF pts:

| Role | CSS | PDF |
|------|-----|-----|
| Action | 3.175mm | 9pt |
| Message / meta | 2.469mm | 7pt |

`drawFooter` paints the same stack as the sheet (heading → message → 2×2 gray meta).

## Follow-ups (2026-08-18)

- Desktop: body columns use `overflow: hidden` so ink past the column box stays in the DOM but is not painted over the left margin.
- Mobile header/footer inputs use `--column-content-width` (same as columns) + `--mobile-inv-scale` sizing — no more `92vw` overflow off-screen. Column layout untouched.
