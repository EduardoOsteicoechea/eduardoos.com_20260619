# Milestone — eVoice playlist share (071) 2026-09-04

- Share Playlists by email: checked tracks or all project audios
- Magic link `/evoice/invite/?token=` → JWT accept copies MP3s into invitee project
- Collisions → `{stem}.sharedN.mp3`; invite JSON at `evoice/invites/{token}.json`
- SMTP via auth mailer; public GET preview; accept requires matching invite email + eVoice access

Spec: `specs/071-evoice-playlist-share/spec.md`
