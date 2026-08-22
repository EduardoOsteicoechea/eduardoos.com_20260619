# Feature 026 — Agent Sandbox

## Status

Go crawl job for agent (2026-08-22).

## Problem

Platform administrators need a private workspace where an AI senior web developer and web crawler architect can turn chat instructions into a specification, static website artifacts, and documentation-derived JSON without touching the Eduardo OS repository or EC2 filesystem. Fake in-browser “crawls” fail in `srcDoc` preview; the agent needs **server-executed** documentation fetch.

## Goals

### Access and route

- UI route: `/admin/agent-sandbox`.
- Linked in the global menu only for `isPlatformAdmin()`.
- Frontend route and every API endpoint require platform admin (`auth.IsAdmin`).

### Persistence and isolation

- No new container, Docker socket, local workspace, shell, or durable EC2 disk.
- All durable state under S3 prefix `agentsandbox/{adminSafe}/`.
- **Sites** own the website; **chats** are conversations grouped under a site.
- Files (flat names): text `.html/.css/.js/.json/.txt/.svg/.md/.py`; binary (base64) `.pdf/.docx/.xlsx` and images `.png/.jpg/.jpeg/.webp/.gif`. Max 2 MiB decoded, ≤ 40 files.
- **No Python / agent JS execution on EC2.** `.py` remains downloadable only.

### Dedicated Go crawl job (locked)

- **Not** Python on EC2. Backend runs a bounded HTTPS crawler in Go.
- Admin supplies **allowlist hosts per request** (no built-in default hosts).
- Limits: `maxPages` default 30, **hard cap 100**; `maxDepth` **default 2**, **hard cap 4**; **job timeout ~60s**.
- SSRF: HTTPS only; host must match allowlist; block private/loopback/link-local IPs; same-host redirects only; body size capped per page.
- **Output:** JSON only (`pages[]` with `url`, `title`, `text`, optional errors). **Does not** write site files — the agent builds the site from that JSON.
- Endpoints:
  - `POST /api/admin/agent-sandbox/crawl/job` — run job, return JSON.
  - `POST /api/admin/agent-sandbox/chats/{id}/ask` — optional `crawl: { startUrl, allowlist, maxPages, maxDepth }`; if `startUrl` + non-empty `allowlist`, backend runs the job **before** DeepSeek, injects `CRAWL_RESULT` JSON into the model user prompt, logs crawl stages on the console SSE. Agent must use that data (no fake browser progress / `fetch('data.json')` sims).
- Legacy `POST …/crawl` (single URL) remains.

### Agent prefs / Ask

- Model prefs unchanged (`deepseek-v4-flash|pro`, thinking, effort).
- System prompt: use `CRAWL_RESULT` when present; never claim live network from the preview iframe.

### UI (locked)

- Header tools unchanged (sidebar, sites, history, files editor to viewport bottom, agent settings, console).
- **Agent settings** also store crawl fields (localStorage): allowlist (comma hosts), start URL, maxPages, maxDepth — sent on Ask when start URL is set.
- Composer image paste / progress bar / ARTIFACTS hold-back unchanged.
- Preview remains `srcDoc` (multi-file fetch still limited); real crawl data is baked into generated files by the agent.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/crawl/job` | Bounded recursive crawl → JSON for agent |
| `POST` | `/chats/{id}/ask` | optional `crawl` job then stream artifacts |
| … | sites/chats/files/… | unchanged |

## Non-goals

- Executing agent Python/JS on EC2.
- Writing crawl output directly into the site (agent assembles files).
- Public share / nested folder trees beyond flat site files.
- Unbounded or off-allowlist crawling.

## Acceptance

- [x] Prior sandbox baseline (sites, editor, images, progress, etc.).
- [x] `POST /crawl/job` respects allowlist, caps, 60s timeout; returns pages JSON.
- [x] Ask with `crawl` injects `CRAWL_RESULT` before DeepSeek; console logs crawl.
- [x] FE settings send allowlist + startUrl + limits on Ask.
- [x] Go tests + frontend build; commit/push.

## Affected paths

- `specs/026-agent-sandbox/spec.md`
- `backend/internal/agentsandbox/**`
- `frontend/src/components/AgentSandbox/**`
