# Feature 026 — Agent Sandbox

## Status

Editor UX + agent prefs + downloadable docs (2026-08-22).

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
- Chat JSON: `id`, `siteId`, `title`, `messages[]`, `updated`.
- Files (flat names): text `.html/.css/.js/.json/.txt/.svg/.md/.py`; binary (base64 in `text`, `encoding:"base64"`) `.pdf/.docx/.xlsx` and images `.png/.jpg/.jpeg/.webp/.gif`. Max 2 MiB decoded, ≤ 40 files; reject traversal, double extensions, unsafe SVG.
- **No Python execution on EC2** (Alpine runtime has no interpreter). Agent may emit `.py` scripts as downloadable artifacts and should also emit the resulting documents as base64 file entries when producing `.pdf`/`.docx`/`.xlsx`/`.txt`.
- **Migration:** legacy chats → site `Default` (unchanged).

### Agent and crawler

- `DEEPSEEK_API_KEY`; per-ask model prefs from client (persisted in `localStorage`):
  - **model:** `deepseek-v4-flash` | `deepseek-v4-pro`
  - **thinking:** `enabled` | `disabled` (flash / non-reasoning = disabled)
  - **reasoning_effort:** `low` | `high` | `max` (UI label “medium” maps to `high`)
- Ask body may include `model`, `thinking`, `reasoningEffort`; backend applies them to DeepSeek.
- Visible assistant `reply` must be Markdown only (never raw artifacts JSON). Client also normalizes legacy messages that stored JSON/`\\n` escapes.
- Ask writes messages to chat and artifacts to site. Accepts file body as `text`/`content`/`body`. `GET site` recovers empty stubs from chat assistant JSON/ARTIFACTS when needed.

### UI (locked)

**Header dynamic slot:**

1. Toggle sidebar  
2. Sites  
3. Chat history (active site)  
4. Files editor — **fullscreen within the content chrome** (starts at the global header rail / top bar, never under it); toolbar icons: Save, Download, Close  
5. **Agent settings** — pick model + thinking mode + effort  
6. Agent console — streams `log`/`progress`/`error`; footer: balance, **phase progress bar** (SSE has no Content-Length; percent is estimated from reasoning→content→artifacts→done), Limpiar. Long reasoning must show moving progress (not look hung).

**Streaming:** hold back `<<<ARTIFACTS>>>` prefixes across token chunks so the marker never appears in chat; `progress` SSE events for the console bar.

**Files editor:** left tree, right textarea for text files (real newlines rendered, not literal `\n`); binary files show a short note + Download. Content loaded from site JSON (in-memory + API), never blank when bytes > 0.

**Chat:** assistant bubbles via `ChatMarkdown`; normalize JSON-shaped / escaped legacy replies on display.

**Composer:** textarea accepts **Ctrl+V / paste of clipboard images** → thumbnail strip (“barra de imágenes”) under the composer. Drag/drop or file picker of images also lands in that strip. Images upload to the active site as base64 binaries (same as docs). Non-image drops still upsert site files; client must send binaries as base64 + `encoding:"base64"` (never `file.text()` on PNG).

**Viewport lock:** unchanged.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET/POST/PATCH` | `/sites…` | unchanged |
| `GET/PUT` | `/sites/{id}/files` | list (includes `text`+`encoding`) / upsert |
| `GET` | `/sites/{id}/files/{name}/download` | attachment download (decode base64 when needed) |
| `POST` | `/chats/{id}/ask` | body may include model prefs |

## Non-goals

- Executing agent Python/JS on EC2.
- Nested folders, recursive crawl, public share.

## Acceptance

- [x] Sites + site-scoped chats + baseline sandbox.
- [x] Fullscreen files editor; icon Save / Download / Close; minimal chrome.
- [x] File contents visible; newlines as real breaks (escapes preserved as characters when stored).
- [x] Legacy Default chat replies render as Markdown.
- [x] Agent settings: flash/pro + thinking + effort.
- [x] Download text/binary agent files; `.py` allowed; binaries via base64.
- [x] Go tests + frontend build; commit/push.
- [x] Console progress bar during ask (phase-estimated; no hung idle during reasoning).
- [x] ARTIFACTS marker never leaked into chat tokens.
- [x] Composer: paste/drop PNG (and jpg/webp/gif) → images bar + base64 site upload (no “Archivo rechazado” for valid images).

## Affected paths

- `specs/026-agent-sandbox/spec.md`
- `backend/internal/agentsandbox/**`
- `frontend/src/components/AgentSandbox/**`
