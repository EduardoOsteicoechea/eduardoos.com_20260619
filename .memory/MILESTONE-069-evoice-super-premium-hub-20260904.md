# Milestone — eVoice Super Premium hub (069) 2026-09-04

- Generate modes: `standard` | `premium` | `super_premium` + `contentPercent` (100/75/50/25/10/5)
- Super Premium: PDF/images → Vision 1-page@200dpi → DeepSeek format → TTS; docx without Vision
- Versioned outputs `{stem}.v{N}…`; Legacy bucket for old MP3s; delete doc ≠ delete audio
- Hub: no dashboard/HDS views; admin owner dropdown; crawl in Upload; print prepared speech; collapsible Upload / Docs+console / Playlists
- Content % slider: left 5% → right 100%
- EC2: worker `.venv` + `pymupdf` via deploy; systemd `EVOICE_PYTHON`; `VISION pct=N` is progress not content%

Spec: `specs/069-evoice-super-premium-hub/spec.md`
