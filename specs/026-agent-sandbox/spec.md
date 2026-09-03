# Feature 026 — Agent Sandbox

## Status

Two-phase Ask: story.md then codegen (2026-08-23).  
Extension (2026-08-27): **Kimi / Moonshot** models selectable beside DeepSeek.

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

1. **Phase story** — LLM call #1 edits the app story only. Output gated as:
   ```
   <<<STORY>>>
   …markdown…
   <<<END>>>
   ```
   Persist `story.md` via upsert + set `site.Spec` to that markdown. SSE: `progress` phase `story`, logs. On failure → SSE `error`; **do not** run phase 2.

2. **Phase code** — LLM call #2 generates the site **only from** the saved `story.md` (+ optional `CRAWL_RESULT`). Reply Markdown for the admin, then `<<<ARTIFACTS>>>` files/tabs. Must not invent requirements absent from the story. Stream tokens as today (ARTIFACTS hold-back).

Optional crawl job before phase 1 still injects `CRAWL_RESULT` into **both** prompts when configured (story may incorporate crawl facts; codegen uses story + crawl).

Progress phases: `request` → `crawl?` → `story` → `reasoning`/`content` → `artifacts` → `saving` → `done`.

### LLM providers (DeepSeek + Kimi)

Settings **Modelo** may select:

| UI value | Provider | Key / base |
|----------|----------|------------|
| `deepseek-v4-flash` | DeepSeek | `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL` |
| `deepseek-v4-pro` | DeepSeek | same |
| `kimi-k3` | Moonshot | `KIMI_API_KEY`, `KIMI_BASE_URL` (default `https://api.moonshot.ai/v1`) |
| `kimi-k2.7-code` | Moonshot | same |

Env aliases (resolved when the client sends short names):

- `KIMI_MODEL_EXPERT` / `KIMI_MODEL_REFEREE` → default general Kimi id (`kimi-k3`)
- `KIMI_MODEL_CODER` → coding model (`kimi-k2.7-code`)

DeepSeek-only: `thinking` + `reasoning_effort` request fields. For Kimi, those prefs are ignored; stream is OpenAI-compatible `chat/completions` SSE. Missing key for the selected provider → clear stream error (no silent fallback to the other provider).

Balance footer remains DeepSeek-only (`GET …/deepseek/balance`).

### UI / crawl / composer

Unchanged from prior locks (settings crawl fields, image paste bar, console progress, fullscreen editor), except model dropdown lists Kimi ids above.

## Non-goals

- Executing agent Python/JS on EC2.
- Writing crawl output directly into the site without the agent.
- Kimi balance API in the footer (v1).
- Routing Contact / Edebat through Kimi (sandbox only).

## Non-negotiables

These rules override any admin phrasing that sounds like host URL routing. Story phase and codegen phase prompts MUST carry them verbatim in spirit.

### Generated-site “routes” are SPA views only

- When the admin asks the sandbox agent to **create a route**, **page**, **screen**, or **path** inside the **generated** site, the agent **MUST** implement it as a new **in-app view** (SPA pattern): one shell (typically `index.html` + shared CSS/JS) that switches visible views via hash (`#/…`), in-memory state, or show/hide panels.
- The agent **MUST NOT** invent, document, or depend on real host/Astro/nginx paths for those screens (e.g. `/about`, `/dashboard`, `/admin/…`, or any path that would collide with or be confused with Eduardo OS site routing).
- Preview remains `srcDoc` / flat workspace files; multi-screen products stay client-side view switches inside that preview, not separate deployable site routes.
- `story.md` MUST describe screens as **views** (names/ids), never as host routes of the parent platform.
- ARTIFACTS `tabs[]` may label views; they do not imply server routes.

## Acceptance

- [x] Prior baseline (sites, editor, images, crawl job, progress).
- [x] Every Ask updates `story.md` + `Site.Spec` before codegen.
- [x] Codegen prompt is story-driven; phase-1 failure skips phase 2.
- [x] Story + codegen system prompts enforce SPA-view-only “routing” (non-negotiable above).
- [ ] Ask with `model=kimi-k3` or `kimi-k2.7-code` uses `KIMI_*` and streams SSE when key is set.
- [ ] Ask with DeepSeek models unchanged when `DEEPSEEK_API_KEY` is set.
- [ ] Go tests + FE build; commit/push; deploy writes `KIMI_*` into EC2 `.env`.

## Affected paths

- `specs/026-agent-sandbox/spec.md`
- `backend/internal/agentsandbox/**`
- `frontend/src/components/AgentSandbox/**`
- `.env.example`, `.github/workflows/deploy.yml`
