# Feature 026 — Agent Sandbox

## Status

Ready to implement (2026-08-22).

## Problem

Platform administrators need a private workspace where an AI senior web developer and web crawler architect can turn chat instructions into a specification, static website artifacts, and documentation-derived JSON without touching the Eduardo OS repository or EC2 filesystem.

## Goals

### Access and route

- UI route: `/admin/agent-sandbox`.
- It is linked in the global menu only for `isPlatformAdmin()`.
- Both the frontend route and every API endpoint require a platform admin; backend authorization is authoritative (`auth.IsAdmin`, supporting the bootstrap email and JWT/stored `admin` role).

### Persistence and isolation

- No new container, Docker socket access, local workspace, shell execution, or durable EC2 memory.
- All durable state lives only under S3 bucket prefix `agentsandbox/{adminSafe}/`.
- The handler uses request-scoped in-memory values only; source code has no `os.WriteFile`, process execution, or arbitrary path access.
- A workspace manifest contains chat messages, tabs, and allowed file metadata. Files may only be `.html`, `.css`, `.js`, `.json`, `.txt`, or `.svg`.
- Reject traversal, path separators, double extensions, unsupported MIME/extension pairs, files over 512 KiB, more than 40 files, and SVG with executable content (`script`, event attributes, `foreignObject`).

### Agent and crawler

- Use `DEEPSEEK_API_KEY`; select `DEEPSEEK_MODEL_REASONING` with a safe default. Requests ask DeepSeek for reasoning mode.
- The system prompt establishes the role **senior web developer and web crawler architect** and requires a JSON result: response text, updated internal spec, files, and tabs.
- The model never receives direct S3, filesystem, shell, network, token, or credential capabilities. The backend validates its returned artifact proposal before writing S3.
- Crawling accepts an explicit HTTPS URL allowlist supplied by the admin for that request. It permits only allowlisted hosts, applies DNS/IP SSRF blocking, does not send cookies, blocks redirects outside the allowlist, limits response to 1 MiB, depth 1, and uses timeouts.
- Normalized crawl output is JSON stored under `agentsandbox/{adminSafe}/crawl/`.

### UI

- The page has a collapsible left sidebar whose toggle is mounted in `#header-dynamic-menu-host`.
- Main workspace is vertical: chat takes 80%; composer takes 20%.
- Composer: textarea takes 80% of the top row; beneath it a 70%-width drag/drop file area is on the left and Send is on the right.
- Preview uses `0.75rem` / 12px baseline, HTML tabs, and a sandboxed iframe. Generated pages cannot access the parent site DOM, auth token, or top-level navigation.
- Each component owns its CSS. Generated pages receive one minimal global stylesheet and use `rem` sizing.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/agent-sandbox/workspace` | Load manifest, files, messages, and crawl records |
| `POST` | `/api/admin/agent-sandbox/ask` | Reasoning chat; validates and writes model artifacts |
| `POST` | `/api/admin/agent-sandbox/files` | Validate and persist admin drag/drop file |
| `POST` | `/api/admin/agent-sandbox/crawl` | Crawl explicit allowlisted HTTPS documentation URL |

## Non-goals

- Executing generated JS on EC2.
- Writing to the repository, local disk, or arbitrary S3 prefixes.
- Following arbitrary links, recursive crawling, browser automation, authentication/cookie forwarding, or public sharing.
- Multi-admin collaboration.

## Acceptance

- [ ] Route and global-menu item are invisible/denied for non-admins.
- [ ] Workspace persists after reload solely from `agentsandbox/` S3 objects.
- [ ] Backend rejects invalid artifact paths/types/SVG payloads and non-admin calls.
- [ ] Agent can save valid static artifacts and tabs from structured DeepSeek output.
- [ ] Crawler refuses private/network-local and non-allowlisted URLs and stores allowed normalized output.
- [ ] Sidebar, 80/20 chat composer, drag/drop control, send control, HTML tabs, and sandboxed preview render responsively.
- [ ] Go tests and frontend build pass.

## Affected paths

- `backend/internal/agentsandbox/**`, `backend/cmd/server/main.go`
- `frontend/src/pages/admin/agent-sandbox.astro`
- `frontend/src/components/AgentSandbox/**`, `frontend/src/lib/agentSandbox.ts`
- `frontend/src/config/routes.ts`, `frontend/src/lib/routeAccess.ts`, `frontend/src/components/Header/Header.tsx`
- `deploy/aws/ec2-iam-s3-policy.json`, `.env.example`
