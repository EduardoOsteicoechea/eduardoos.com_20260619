# Milestone — eVoice continuous playlist autoplay (2026-09-01)

- Fix: track `ended` now advances and waits for `canplay`/`loadeddata` before `play()` so the next chapter starts automatically
- Next/Previous use functional `setTrackIndex` + `audiosLenRef` to avoid stale closures

Spec: `specs/044-evoice/spec.md`
