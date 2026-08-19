# Milestone: Agent profile context corpus — 2026-08-19

## Shipped
- Spec `specs/009-agent-profile-context/spec.md`
- Canonical corpus `backend/internal/contact/PROFILE_CONTEXT.md` (voice + third-person facts + privacy)
- Runtime: expanded `ProfileQASystemPrompt` + `professionalProfileContext` in `identity.go`
- FE welcomes + `.cursor/skills/agent-voice` aligned
- Contact package tests for prompt/context invariants

## Notes
- Root `about_eduardo_*` and CV PDF stay gitignored (source dumps, not runtime).
- Agent remains non-impersonating; Venezuela-only residence script; never family.
