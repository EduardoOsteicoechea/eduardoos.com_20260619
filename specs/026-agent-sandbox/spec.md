# Feature 026 — Agent Sandbox

## Status

Ready to implement (2026-08-22). UX revision locked from annotated screenshots.

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
- Conversations are individual JSON objects:
  ```
  agentsandbox/{adminSafe}/chats/index.json
  agentsandbox/{adminSafe}/chats/{chatId}.json
  ```
- Each chat JSON holds: `id`, `title`, `spec`, `messages[]`, `files[]` (html/css/js/json/txt/svg only), `tabs[]`, `updated`.
- Reject traversal, double extensions, unsupported types, files > 512 KiB, > 40 files, unsafe SVG.

### Agent and crawler

- `DEEPSEEK_API_KEY` + `DEEPSEEK_MODEL_REASONING` (reasoning mode enabled).
- Role: senior web developer and web crawler architect. Returns JSON: `reply`, `spec`, `files`, `tabs`.
- Model has no S3/FS/shell/network/credentials; backend validates proposals before write.
- Crawl: explicit HTTPS allowlist per request; SSRF blocks; no cookies; redirect host lock; 1 MiB cap.

### UI (locked)

Layout: **left collapsible chat sidebar** + **right full-height generated website preview**.

**Header dynamic slot** (`#header-dynamic-menu-host`) — four icon buttons:

1. **Toggle sidebar** — show/hide the left chat panel.
2. **Chat history** — modal listing prior conversations from S3 JSON; open another chat or delete one; create new chat.
3. **File structure** — modal listing the website files of the active chat (names from S3-backed chat JSON).
4. **Agent console** — vertical panel (sidebar-like modal, height ≤ window) that streams verbose process logs and errors in real time (`log` / `error` SSE events). Footer left shows **DeepSeek balance remaining** (from `GET /user/balance` via backend proxy), refreshed when the console opens and after each ask completes; footer right keeps **Limpiar**.

**Viewport lock:**

- The Agent Sandbox route never scrolls the document. Only the chat tray and the **iframe interior** of the generated website may scroll. Outer preview frame/border stays fully visible in the viewport.

**Sidebar** (when open):

- Height split **80% / 20%** vertical; **padding-bottom** so the drop/send row is not flush with the viewport edge.
- **Top 80%:** chat message tray (scrollable).
- Chat body text: **12px**; each bubble shows a small timestamp above the body at **0.5×** that size.
- Messages render as **safe Markdown** (reuse `ChatMarkdown`).
- On send: the user message (and an empty assistant bubble) appear **immediately**; the assistant reply **streams** (SSE), not as a single late block.
- **Bottom 20%:** composer:
  - Top of composer (~80% of the 20% band): multiline text input.
  - Bottom row: left **70%** drag/drop file zone; right **Send** button.

**Main pane** (remaining width, full height under site header):

- HTML view tabs for agent-generated pages.
- Sandboxed iframe preview (`font-size: 0.75rem` / 12px baseline intent for generated pages).
- No chat/composer in the main pane.

### Agent reply shape (streaming)

- Visible stream is Markdown for the admin.
- After Markdown, the model appends a machine block:
  ```
  <<<ARTIFACTS>>>
  {"spec":"...","files":[...],"tabs":[...]}
  <<<END>>>
  ```
- `POST …/ask` responds with **SSE** (`text/event-stream`): `log` (verbose process), `token` (Markdown deltas), then `done` with the saved chat (or `error`). Nginx must disable buffering and allow long read timeouts for this path.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/agent-sandbox/chats` | List chat summaries from `chats/index.json` |
| `POST` | `/api/admin/agent-sandbox/chats` | Create empty chat JSON |
| `GET` | `/api/admin/agent-sandbox/chats/{id}` | Load one chat |
| `DELETE` | `/api/admin/agent-sandbox/chats/{id}` | Delete chat JSON + index row; client must refresh list and, if the open chat was deleted, switch to another (or create) without stale cache |
| `GET` | `/api/admin/agent-sandbox/deepseek/balance` | Proxy to DeepSeek `GET /user/balance`; returns currency + total remaining for the console footer |
| `POST` | `/api/admin/agent-sandbox/chats/{id}/ask` | SSE: Markdown token stream + final saved chat |
| `POST` | `/api/admin/agent-sandbox/chats/{id}/files` | Upload/validate drop file into chat |
| `GET` | `/api/admin/agent-sandbox/chats/{id}/files` | File structure for the website in that chat |
| `POST` | `/api/admin/agent-sandbox/crawl` | Allowlisted documentation crawl |

## Non-goals

- Executing generated JS on EC2.
- Writing outside `agentsandbox/{adminSafe}/`.
- Recursive crawl, cookies, public share, multi-admin collab.

## Acceptance

- [x] Admin-only route + menu link.
- [x] Dynamic header: sidebar toggle, chat history, file structure.
- [x] Sidebar 80% chat / 20% composer (textarea + 70% drop + Send); main pane = generated preview only.
- [x] Chats persist/switch/delete via S3 JSON under `agentsandbox/`.
- [x] File structure modal lists active chat artifacts.
- [x] Sidebar has bottom padding; optimistic send; Markdown @ 12px; timestamp 0.5×; SSE streaming.
- [x] Go tests + frontend build pass.
- [x] Viewport-locked layout (no document scroll; iframe scrolls inside).
- [x] Dynamic header console streams verbose agent logs/errors.
- [x] Nginx SSE buffering off + long timeouts for `…/ask`.
- [x] Console footer shows DeepSeek remaining balance (left).
- [x] Deleting a chat from history updates the list and active preview immediately (no stale cache).

## Affected paths

- `specs/026-agent-sandbox/spec.md`
- `backend/internal/agentsandbox/**`, `backend/cmd/server/main.go`
- `frontend/src/pages/admin/agent-sandbox.astro`
- `frontend/src/components/AgentSandbox/**`
- `frontend/src/config/routes.ts`, `frontend/src/lib/routeAccess.ts`, `Header.tsx`
- `nginx/default.conf` (SSE location for agent-sandbox ask)
