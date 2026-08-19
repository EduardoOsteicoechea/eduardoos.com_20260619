# Feature 009 — Agent profile context corpus (voice + facts)

## Status

Ready to implement (plan approved 2026-08-19).

## Problem

Visitor agents (home dock `/api/profile/ask`, contact `/api/contact/ask`) used a short generic `professionalProfileContext` and a system prompt that did not encode the full biography, privacy scripts, or tone guardrails from Eduardo’s source materials (model tuning JSON/TXT, RAG profile TXT, CV PDF).

## Goals

1. Publish a **canonical human-readable corpus** at `backend/internal/contact/PROFILE_CONTEXT.md` (voice + third-person facts + privacy scripts).
2. Wire that content into production:
   - `ProfileQASystemPrompt` — identity, tone, privacy, language, CONTACT_* handoff.
   - `professionalProfileContext` — factual brief injected every turn via `buildUserPrompt`.
3. Keep **non-impersonation**: AI agent, third person only (agent-voice skill wins over legacy “speak as Eduardo” tuning).
4. Align FE welcomes (`agentVoice.ts`) and `.cursor/skills/agent-voice/SKILL.md` with the same rules.
5. Canonical public contact: `eduardooost@gmail.com`, WhatsApp `+584147281033` / `https://wa.me/584147281033`, LinkedIn `linkedin.com/in/eduardoosteicoechea`.

## Non-goals

- Vector DB / embedding RAG.
- Changing `[[CONTACT_EMAIL]]` / `[[CONTACT_WHATSAPP]]` markers or SMTP.
- Publishing the CV PDF or root `about_eduardo_*` files as runtime sources.
- First-person impersonation of Eduardo.

## Source → runtime mapping

| Source | Use |
|--------|-----|
| Model tuning JSON/TXT | Tone, concision, no inventing, no family, Venezuela residence script, ban meta-phrases |
| Profile RAG TXT + JSON `rag_data` | Timeline (rewrite to third person) |
| CV PDF 2025 | Summary skills, education extras, public links, stack |
| Existing `identity.go` + agent-voice | Identity, language match, CONTACT_* protocol |

## Privacy (mandatory)

- Residence: only “Venezuela” + redirect to public contact channels (exact script in corpus / prompt).
- Never disclose family information.
- Birth date may appear in factual context; never a street address.
- Ignore alternate emails such as `eduardoos@gmail.com` when they conflict with the canonical owner email.

## Dates

- Avant Leap: **March 2024–present** (JSON “Present” wins over any PDF export end date).

## Acceptance

- [x] `PROFILE_CONTEXT.md` exists with voice, third-person profile, privacy scripts.
- [x] `ProfileQASystemPrompt` encodes AI identity, third person, privacy, ban phrases, language match, CONTACT_*.
- [x] `professionalProfileContext` is third person, covers education/experience/skills/links; no “I worked…”.
- [x] Contact tests cover prompt/context invariants; `go test ./internal/contact/...` green.
- [x] FE welcomes + agent-voice skill aligned; root source dumps remain gitignored.
