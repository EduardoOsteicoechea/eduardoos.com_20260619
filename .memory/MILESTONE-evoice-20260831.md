# Milestone — eVoice (2026-08-31)

Feature 044: text-to-audio (eVoice) in Eduardo OS.

- Catalog `evoice` ($1); temporary allowlist `eliasosteic@gmail.com`, `laleskavf.2una@gmail.com`; admin sees all users
- S3 `evoice/{userSafe}/{project}/docs|audios` on `eduardoos20260607`; job snapshots `evoice/_jobs/{jobId}.json`
- API `/api/evoice/*` + sandbox worker (`linux_sync.py`: Piper → espeak-ng → ffmpeg; optional `--premium` DeepSeek)
- Page `/evoice` + tray link; Material Symbols icons on all global tray buttons
- Admin owner picker sticky (init effect one-shot)
- Paste textarea → `POST .../docs/text` → `paste-YYYYMMDD-HHMMSS.txt`
- Premium checkbox → DeepSeek reasoning rewrite before TTS; `docs/<stem>.premium.txt`
- Job death: UI waits `/health`, auto-resumes unfinished files; GET job loads S3 snapshot after restart
- Convert progress: FILE/EXTRACT/PREMIUM/TTS/FFMPEG lines → per-file + overall progress
- Stop generate + Resume unfinished files; DeepSeek premium uses SSE stream; weighted progress (std 80/10/10, premium 30/30/20+10+10)
- UI: no page heading; errors via ServerErrorModal; playlist under Console
- Premium → chapter MP3s (`{stem}.cNN-title.mp3`); audio GET wildcard fixes spaces/parens 404

Spec: `specs/044-evoice/spec.md`
