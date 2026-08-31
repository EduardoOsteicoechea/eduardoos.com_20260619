# Milestone — eVoice (2026-08-31)

Feature 044: text-to-audio (eVoice) in Eduardo OS.

- Catalog `evoice` ($1); temporary allowlist `eliasosteic@gmail.com`, `laleskavf.2una@gmail.com`; admin sees all users
- S3 `evoice/{userSafe}/{project}/docs|audios` on `eduardoos20260607`
- API `/api/evoice/*` + sandbox worker (`linux_sync.py`: Piper → espeak-ng → ffmpeg)
- Page `/evoice` + tray link; Material Symbols icons on all global tray buttons

Spec: `specs/044-evoice/spec.md`
