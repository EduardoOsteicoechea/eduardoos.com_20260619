# Feature 026 — Agent Sandbox

## Status

Sites + file editor revision (2026-08-22).

## Problem

Platform administrators need a private workspace where an AI senior web developer and web crawler architect can turn chat instructions into a specification, static website artifacts, and documentation-derived JSON without touching the Eduardo OS repository or EC2 filesystem.

## Goals

### Access and route

- UI route: `/admin/agent-sandbox`.
- Linked in the global menu only for `isPlatformAdmin()`.
- Frontend route and every API endpoint require platform admin (`auth.IsAdmin`).

### Persistence and isolation

- No new container, Docker socket, local workspace, shell, or durable EC2 disk.
- All durable state under S3 prefix `agentsandbox/{adminSafe}/`.
- **Sites** own the website; **chats** are conversations grouped under a site:
  ```
  agentsandbox/{adminSafe}/sites/index.json
  agentsandbox/{adminSafe}/sites/{siteId}.json
  agentsandbox/{adminSafe}/chats/{chatId}.json
  ```
- Site JSON: `id`, `name`, `spec`, `files[]`, `tabs[]`, `chatIds[]`, `updated`.
- Chat JSON: `id`, `siteId`, `title`, `messages[]`, `updated` (legacy `files`/`tabs`/`spec` ignored after migrate).
- Files: `.html/.css/.js/.json/.txt/.svg` only; flat names; reject traversal, double extensions, > 512 KiB, > 40 files, unsafe SVG.
- **Migration:** if sites index is missing and legacy `chats/index.json` exists, create site `Default`, attach all chats, move files/spec/tabs from the richest chat into the site.

### Agent and crawler

- `DEEPSEEK_API_KEY` + `DEEPSEEK_MODEL_REASONING` (reasoning mode enabled).
- Role: senior web developer and web crawler architect. Returns JSON: `reply`, `spec`, `files`, `tabs`.
- Model has no S3/FS/shell/network/credentials; backend validates proposals before write.
- Ask writes **messages** to the chat and **artifacts** (spec/files/tabs) to the **site**.
- Crawl: explicit HTTPS allowlist per request; SSRF blocks; no cookies; redirect host lock; 1 MiB cap.

### UI (locked)

Layout: **left collapsible chat sidebar** + **right full-height generated website preview**.

**Header dynamic slot** (`#header-dynamic-menu-host`):

1. **Toggle sidebar** — show/hide the left chat panel.
2. **Sites** — panel to list sites; **one name input** creates a site when submitted empty-selection / Enter, and **renames** the active site when edited; selecting a site reloads that site’s chat history and preview.
3. **Chat history** — conversations of the **active site** only; open/delete/create chat within that site.
4. **Files editor** — wide panel: left flat file list (tree), right simple text editor; Save upserts the file on the site in S3 and refreshes preview.
5. **Agent console** — vertical panel (height ≤ window) streaming `log`/`error` SSE; footer left DeepSeek balance; footer right Limpiar.

**Viewport lock:** document never scrolls; only chat tray and iframe interior scroll.

**Sidebar** (when open): 80/20 chat/composer; Markdown 12px; timestamps 0.5×; optimistic send + SSE stream.

**Main pane:** HTML tabs + sandboxed iframe from **active site** files.

### Agent reply shape (streaming)

- Markdown then `<<<ARTIFACTS>>>…<<<END>>>` JSON.
- `POST …/ask` SSE: `log`, `token`, `done` (chat + site snapshot) or `error`. Nginx unbuffered, long timeouts.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/agent-sandbox/sites` | List sites (runs migration if needed) |
| `POST` | `/api/admin/agent-sandbox/sites` | Create site `{name}` (+ empty starter chat) |
| `GET` | `/api/admin/agent-sandbox/sites/{id}` | Load one site |
| `PATCH` | `/api/admin/agent-sandbox/sites/{id}` | Rename `{name}` |
| `GET` | `/api/admin/agent-sandbox/sites/{id}/files` | File rows for editor |
| `PUT` | `/api/admin/agent-sandbox/sites/{id}/files` | Upsert one file `{name,text}` into site |
| `GET` | `/api/admin/agent-sandbox/chats?siteId=` | Chat summaries for site |
| `POST` | `/api/admin/agent-sandbox/chats` | Create chat `{siteId}` |
| `GET` | `/api/admin/agent-sandbox/chats/{id}` | Load chat |
| `DELETE` | `/api/admin/agent-sandbox/chats/{id}` | Delete chat; update site `chatIds` |
| `POST` | `/api/admin/agent-sandbox/chats/{id}/ask` | SSE ask → site artifacts + chat messages |
| `GET` | `/api/admin/agent-sandbox/deepseek/balance` | DeepSeek balance proxy |
| `POST` | `/api/admin/agent-sandbox/crawl` | Allowlisted crawl |

Legacy `GET/POST …/chats/{id}/files` remain as aliases that operate on the chat’s site when `siteId` is set.

## Non-goals

- Nested folders, executing generated JS on EC2, writing outside `agentsandbox/{adminSafe}/`, recursive crawl, public share.

## Acceptance

- [x] Prior Agent Sandbox baseline (admin route, SSE, console, viewport lock, balance).
- [x] Sites header panel: list, create/rename via same name input, select updates chats + preview.
- [x] Files editor: tree + textarea + Save to S3 on active site.
- [x] Chats scoped to active site; ask persists artifacts on site.
- [x] Legacy chats migrate into Default site.
- [x] Go tests + frontend build; commit/push.

## Affected paths

- `specs/026-agent-sandbox/spec.md`
- `backend/internal/agentsandbox/**`
- `frontend/src/components/AgentSandbox/**`
- `nginx/default.conf` (ask SSE already present)
