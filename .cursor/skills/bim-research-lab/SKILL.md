---
name: bim-research-lab
description: >-
  Closed BIM/AEC research lab under backend/bim_research/: chats, crawlers,
  Python scripts, and .md/.html/.docx results. Use when the user asks for BIM
  research, lab crawlers, or work inside bim_research.
---

# BIM research lab

## Before coding

1. Read `specs/036-bim-research-write-sandbox/spec.md` if the boundary is unclear.
2. Create/update a **local** brief: `backend/bim_research/specs/<topic>.md`.
3. Ask until unambiguous; then implement only under `backend/bim_research/`.

## Layout

- `scripts/` — crawlers and Python utilities
- `chats/` — chat exports / notes
- `out/` — generated `.md`, `.html`, `.docx`
- `.venv/` — local virtualenv (gitignored)

## Run pattern

```bash
cd backend/bim_research
python -m venv .venv
# activate, then: pip install -r scripts/requirements.txt
python scripts/<script>.py
```

Outputs must land under `out/` (or another path still inside this lab).

## Hard stop

Any requested write outside `backend/bim_research/` → refuse and stay in-lab (or point at widening 036).
