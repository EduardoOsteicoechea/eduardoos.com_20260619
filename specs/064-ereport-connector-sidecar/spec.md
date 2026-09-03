# Feature 064 — OSS connector as `.ereport/` sidecar

## Status

**Ready to implement** (2026-09-03).

## Problem

Consumers want the cleanest host-repo footprint: not vendoring a long skill+CLI into their tree, and not depending only on copy-paste prompts. Spec 063’s public skill is good for Cursor discovery; a dedicated OSS connector is better as the **runtime**.

## Goals

### 1. Public repo `eduardoos-ereport-connector`
- Owner: `EduardoOsteicoechea/eduardoos-ereport-connector` (public)
- Contains: `ereport_client.py`, `.env.example`, skill (`skill/eduardoos-ereport/`), CAVEATS, reference, README, install helpers
- License: MIT (or Apache-2.0 if preferred — default **MIT**)

### 2. Install as silent sidecar `.ereport/`
Canonical install into the **consumer project root**:

```bash
git clone --depth 1 https://github.com/EduardoOsteicoechea/eduardoos-ereport-connector.git .ereport
```

- Dot-directory = low visual noise (“silent” sidecar), keeps the user’s repo clean
- Not the same as a `*.ereport` report file — this is a **folder** named `.ereport`
- Recommended `.gitignore` in consumer: `.ereport/.env`, `report.payload.json` (under `.ereport/`); optionally ignore whole `.ereport/` if they prefer clone-per-machine, or use a git submodule

### 3. Wire Cursor skill without clutter
Install script (or README steps) also places/links the skill into:

```text
.cursor/skills/eduardoos-ereport/   ← from .ereport/skill/eduardoos-ereport/
```

so Cursor discovers it; code stays only under `.ereport/`.

### 4. Product docs (eduardoos.com monorepo)
- `/api-docs` + agent prompt: **clone into `.ereport`** first; then invoke skill
- Public `/skills/eduardoos-ereport/` remains a **mirror** / fallback download; points to GitHub + `.ereport` install
- Thin `scripts/eduardoos-ereport/` in monorepo → pointer README (no duplicate client long-term)

## Non-goals
- npm/PyPI package in this turn (CLI stdlib is enough)
- Changing eReport API
- Auto-committing `.ereport` into consumer repos

## Acceptance
- [x] Public GitHub repo created and pushed
- [x] Install path documented as `.ereport/` + skill wire-up
- [x] ApiDocs / skill / PROMPT_SDK updated to connector-first
- [x] Monorepo scripts folder thinned to pointer
- [x] FE build if docs change; monorepo commit + push

## Affected paths
- New repo: `EduardoOsteicoechea/eduardoos-ereport-connector`
- `specs/064-ereport-connector-sidecar/spec.md`
- `frontend/src/components/ApiDocs/**`
- `frontend/public/skills/eduardoos-ereport/**`
- `.cursor/skills/eduardoos-ereport/**`
- `scripts/eduardoos-ereport/**`
- `backend/internal/apikeys/docs.go`
