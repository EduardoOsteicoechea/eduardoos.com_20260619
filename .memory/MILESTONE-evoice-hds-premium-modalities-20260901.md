# Milestone — eVoice HDS icons + premium all modalities (2026-09-01)

- Spec 044/045: Header Dynamic Section product buttons are **icon-only** Material Symbols (no visible text); label only via `title`/`aria-label`
- `ProductHeaderMenu` + eVoice / Music / Pamphlet / Homescool / eReport wired with icons
- Premium ON: every modality (paste/.txt/.docx/PDF-text/PDF-image/image) extracts then DeepSeek `role:system` (`PREMIUM_SYSTEM`) before chapter TTS
- Scanned/image PDF: OCR fallback via pymupdf (or pdftoppm) + Tesseract when text layer is sparse
- Worker `requirements.txt` adds `pymupdf`; FakeRunner test covers multi-modality premium sidecars

Specs: `specs/044-evoice/spec.md`, `specs/045-global-theme-product-dashboards/spec.md`
