# Feature 036 — BIM Research Write Sandbox (Cursor harness)

## Status

Implemented (2026-08-29). User confirmed; harness rules + lab seed shipped.

## Problem

BIM / AEC research needs a durable place for chats, crawlers, Python scripts, and viewable results (`.md`, `.html`, `.docx`) without agents mutating the rest of Eduardo OS. Global agent rules (commit/push, Spec-first) still apply, but **writes must be confined** to one directory while the full repo stays readable for context.

## Goals

### Write sandbox (absolute)

- **Write root:** `backend/bim_research/` (create the tree if missing).
- Allowed durable mutations **only** under that root: create, edit, delete, rename, move, and shell redirects / package installs / venvs / generated artifacts that land inside the root.
- Forbidden: any write under the rest of the repo (including `frontend/`, other `backend/` packages, root `specs/` during research turns, `.env`, secrets, deploy/CI, Docker, nginx) unless this feature’s **bootstrap exception** applies (below).

### Read access

- The agent **may read** the entire repository (and use read-only tools) for context.
- Shell outside the write root is **read-only**: e.g. `git status`, `git diff`, `rg`, `cat`/`type`, listing, tests or commands that do not create or modify files outside the write root.
- No redirects, temp dumps, or tool writes outside the write root.

### Activation (A + B)

Harness rules apply when **either**:

1. **Always-apply** Cursor rule for this feature is present (baseline reminder of the boundary), **or**
2. Files under `backend/bim_research/**` are in context / being edited.

When active, the agent follows the user’s instructions **exactly**, but **only** by mutating the write root. “Helpful” edits elsewhere are out of scope.

### Spec-first (kept)

Spec-first is **not** waived.

| Turn type | Where the spec lives | What may be written |
|-----------|----------------------|---------------------|
| **Harness bootstrap** (this feature) | Repo `specs/036-bim-research-write-sandbox/spec.md` | Paths listed under **Affected paths** (bootstrap exception) |
| **Research work** (chats, crawlers, scripts, artifacts) | Local brief under `backend/bim_research/` (e.g. `backend/bim_research/specs/<topic>.md` or `…/research/<topic>/spec.md`) | Only under `backend/bim_research/` |

Order for research turns:

1. Update/create the **local** research brief until unambiguous; ask if material alternatives remain.
2. Implement exactly from that brief (scripts, crawlers, outputs).
3. Do not invent scope outside the brief or outside the write root.

### Research purpose (directory role)

`backend/bim_research/` is a **closed research lab**, not a production microservice. It exists to:

- Conduct research via **chats**, **crawlers**, and **Python scripts**.
- Persist and **view results** primarily as **`.md`**, **`.html`**, and **`.docx`**.
- Hold supporting assets needed for that work (scripts, configs, caches, venvs, crawled snapshots) **inside** the write root.

Suggested layout (non-binding; agent may adapt if the local brief says otherwise):

```text
backend/bim_research/
  README.md                 # lab purpose + how to run
  specs/                    # local Spec-first briefs
  chats/                    # chat exports / session notes
  scripts/                  # Python crawlers & utilities
  out/                      # generated .md / .html / .docx (+ intermediates)
  .venv/                    # optional local venv (gitignored if heavy)
```

### Git (mandatory commit/push, sandbox-scoped)

After an agentic research turn completes durable changes:

1. Follow repo **mandatory commit & push**.
2. Stage **only** paths under `backend/bim_research/` (plus this feature’s bootstrap paths when implementing 036 itself).
3. Never stage `.env`, credentials, or secrets.
4. Frontend pre-push compile gate does **not** apply unless the turn also changed `frontend/**` (research turns must not).

### Bootstrap exception (one-time / feature maintenance)

Implementing or updating **this harness** may write outside the research write root, limited to:

- `specs/036-bim-research-write-sandbox/**`
- `.cursor/rules/**` (and optional `.cursor/skills/**`) that encode this boundary
- `backend/bim_research/**` (seed README / layout / gitignore as specified)
- `.gitignore` entries **only** as needed to ignore heavy lab artifacts (e.g. `.venv/`, large caches) under `backend/bim_research/`

No other repo paths.

### Delivery mechanism

- Cursor **alwaysApply** rule documenting write/read/shell/git/Spec-first behavior.
- Optional file-scoped reinforcement via globs `backend/bim_research/**`.
- Optional skill pointing agents at the lab workflow.
- Not a new Docker service, gateway route, or admin UI (distinct from feature 026 Agent Sandbox).

## Non-goals

- OS/container hard isolation (this is an **agent policy** harness, not a kernel sandbox).
- Replacing or merging with `/admin/agent-sandbox` (026).
- Allowing research turns to edit production Go services, frontend, or root `specs/` other than 036 bootstrap.
- Mandatory TDD / narrative-comment playbook for every Python one-liner inside the lab (local brief may require tests when the research says so).
- Guaranteeing crawler legality/ToS compliance beyond: prefer public docs; no credential stuffing; no bypass of auth walls.

## Acceptance

- [x] Spec confirmed by user (this file).
- [x] Always-apply Cursor rule encodes: write root, read-all, shell read-only outside, Spec-first local briefs, commit/push sandbox-only.
- [x] Optional glob-scoped rule or skill for `backend/bim_research/**`.
- [x] `backend/bim_research/README.md` states lab purpose and layout.
- [x] `.gitignore` ignores heavy/generated lab paths as needed (venv, caches) without ignoring result formats the user wants tracked (`.md` / `.html` / `.docx` by default **are** trackable unless a local brief says otherwise).
- [x] Agent faced with a request to edit outside the write root during a research turn: refuses that write and continues only inside the lab (or asks to widen scope via this spec).
- [x] After a research change set: commit + push include only sandbox (or bootstrap) paths.

## Affected paths

- `specs/036-bim-research-write-sandbox/spec.md`
- `.cursor/rules/` (new bim-research write-sandbox rule)
- `.cursor/skills/` (optional)
- `backend/bim_research/**`
- root `.gitignore` (lab ignores only)

## Open (non-blocking defaults)

Locked defaults unless the user overrides before implement:

- **Network:** crawlers/scripts may use the network; outputs stay in the write root.
- **Python:** run from the lab (prefer `backend/bim_research/.venv`); dependencies installed into that venv only.
- **DOCX:** generate via explicit lab scripts/deps inside the write root; no requirement to add a production microservice.
