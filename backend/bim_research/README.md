# BIM research lab

Closed write sandbox for BIM/AEC research inside Eduardo OS. Agents may **read** the rest of the repo but must **write only here**. Policy: `specs/036-bim-research-write-sandbox/spec.md`.

## Purpose

- Research via chats, crawlers, and Python scripts
- View results as `.md`, `.html`, and `.docx`
- Keep production services and frontend untouched

## Layout

```text
backend/bim_research/
  README.md       # this file
  specs/          # local Spec-first briefs (required before durable work)
  chats/          # chat exports / session notes
  scripts/        # Python crawlers & utilities
  out/            # generated .md / .html / .docx (+ intermediates)
  .venv/          # local virtualenv (gitignored)
```

## How to run scripts

```bash
cd backend/bim_research
python -m venv .venv
# Windows: .venv\Scripts\activate
# Unix:    source .venv/bin/activate
pip install -r scripts/requirements.txt   # when present
python scripts/<name>.py
```

Put deliverables under `out/`. Network use is allowed; do not write outside this directory.

## Spec-first (local)

Before durable crawlers/scripts/artifacts, add or update `specs/<topic>.md` in this lab. Do not use root `specs/` for research topics.
