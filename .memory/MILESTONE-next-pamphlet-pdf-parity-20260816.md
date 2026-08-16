# Milestone: Next pamphlet PDF parity with legacy — 2026-08-16

## Status: RESTORED on Next

Print on Eduardo OS Next was a **stub** (`BuildSamplePDF` / Helvetica / one A4 page) that wrote raw UTF-8 into PDF strings → nearly blank `panfleto.pdf` with mojibake titles (`¿Cˆ‡mo…`).

| Area | Change |
|------|--------|
| `eduardoos-next/backend/pkg/pdf/` | Ported production pamphlet renderer (Roboto TTF embed, WinAnsi, 2-page Letter landscape, columns/header/footer/images) |
| `internal/documents` | `POST /api/documents/pamphlet/pdf` now unmarshals full `PamphletDocument` and calls `BuildPamphletPDF` |
| Encoding | `toWinAnsi` + `/WinAnsiEncoding` (same as legacy); RFC 5987 `filename*` via `httpx.ContentDispositionAttachment` |
| Tests | Legacy pamphlet layout/encoding tests + handler assertions for Count 2, Roboto, WinAnsi bytes |

Frontend path unchanged: `DOCUMENT_ROUTES.pamphletPdf` → JWT POST of live EPAM JSON.

Note: Next copy omits `golang.org/x/image/webp` (stdlib JPEG/PNG/GIF only); FE `ensurePamphletImagesAreJpeg` already runs before print.
