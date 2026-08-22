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

**Header dynamic slot** (`#header-dynamic-menu-host`) — three icon buttons (same pattern as Scrib/Homescool):

1. **Toggle sidebar** — show/hide the left chat panel.
2. **Chat history** — modal listing prior conversations from S3 JSON; open another chat or delete one; create new chat.
3. **File structure** — modal listing the website files of the active chat (names from S3-backed chat JSON).

**Sidebar** (when open):

- Height split **80% / 20%** vertical.
- **Top 80%:** chat message tray (scrollable).
- **Bottom 20%:** composer:
  - Top of composer (~80% of the 20% band): multiline text input.
  - Bottom row: left **70%** drag/drop file zone; right **Send** button.

**Main pane** (remaining width, full height under site header):

- HTML view tabs for agent-generated pages.
- Sandboxed iframe preview (`font-size: 0.75rem` / 12px baseline intent for generated pages).
- No chat/composer in the main pane.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/agent-sandbox/chats` | List chat summaries from `chats/index.json` |
| `POST` | `/api/admin/agent-sandbox/chats` | Create empty chat JSON |
| `GET` | `/api/admin/agent-sandbox/chats/{id}` | Load one chat |
| `DELETE` | `/api/admin/agent-sandbox/chats/{id}` | Delete chat JSON + index row |
| `POST` | `/api/admin/agent-sandbox/chats/{id}/ask` | Reasoning turn on that chat |
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
- [x] Go tests + frontend build pass.

## Affected paths

- `specs/026-agent-sandbox/spec.md`
- `backend/internal/agentsandbox/**`, `backend/cmd/server/main.go`
- `frontend/src/pages/admin/agent-sandbox.astro`
- `frontend/src/components/AgentSandbox/**`
- `frontend/src/config/routes.ts`, `frontend/src/lib/routeAccess.ts`, `Header.tsx`
- `deploy/aws/ec2-iam-s3-policy.json`
