# Feature 026 — Agent Sandbox

## Status

Two-phase Ask: story.md then codegen (2026-08-23).

## Problem

Platform administrators need a private workspace where an AI senior web developer can turn chat into a durable **app story** and then static website artifacts, without touching the Eduardo OS repo or EC2 filesystem. Single-shot artifact dumps lose product memory across turns.

## Goals

### Access and route

- UI route: `/admin/agent-sandbox`; platform admin only.

### Persistence

- All durable state under S3 `agentsandbox/{adminSafe}/`.
- Sites own website files; chats are conversations under a site.
- Canonical product memory: flat site file **`story.md`**.
- `Site.Spec` **mirrors** the current `story.md` body (compat for prompts / legacy).
- Flat files; max 2 MiB / ≤40; binaries base64; no Python execution on EC2.

### Two-phase Ask (locked)

Every `POST …/chats/{id}/ask`:

1. **Phase story** — DeepSeek call #1 edits the app story only. Output gated as:
   ```
   <<<STORY>>>
   …markdown…
   <<<END>>>
   ```
   Persist `story.md` via upsert + set `site.Spec` to that markdown. SSE: `progress` phase `story`, logs. On failure → SSE `error`; **do not** run phase 2.

2. **Phase code** — DeepSeek call #2 generates the site **only from** the saved `story.md` (+ optional `CRAWL_RESULT`). Reply Markdown for the admin, then `<<<ARTIFACTS>>>` files/tabs. Must not invent requirements absent from the story. Stream tokens as today (ARTIFACTS hold-back).

Optional crawl job before phase 1 still injects `CRAWL_RESULT` into **both** prompts when configured (story may incorporate crawl facts; codegen uses story + crawl).

Progress phases: `request` → `crawl?` → `story` → `reasoning`/`content` → `artifacts` → `saving` → `done`.

### UI / crawl / composer

Unchanged from prior locks (settings crawl fields, image paste bar, console progress, fullscreen editor).

## Non-goals

- Executing agent Python/JS on EC2.
- Writing crawl output directly into the site without the agent.

## Acceptance

- [x] Prior baseline (sites, editor, images, crawl job, progress).
- [x] Every Ask updates `story.md` + `Site.Spec` before codegen.
- [x] Codegen prompt is story-driven; phase-1 failure skips phase 2.
- [x] Go tests + FE build; commit/push.

## Affected paths

- `specs/026-agent-sandbox/spec.md`
- `backend/internal/agentsandbox/**`
- `frontend/src/components/AgentSandbox/**` (console logs only if needed)
