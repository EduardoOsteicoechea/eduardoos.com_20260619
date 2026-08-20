# Milestone — Scrib app (2026-08-20)

Shipped feature 024: subscription `scrib`, dashboard of books/sheets, US Letter editor
with six SVG layers over `documento_generado_columnas.jpg`, S3 under `scrib/`,
header tools (dashboard, zoom/pan, stroke ±, eraser, layers modal, undo), autosave
on pointer-up.

Spec: `specs/024-scrib/spec.md`
BE: `backend/internal/scrib/`
FE: `/scrib`, `/scrib/{user}/{book}/{sheet}` via nginx → `/scrib/sheet`
