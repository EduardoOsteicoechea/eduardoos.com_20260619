# Feature 037 — BIM IFC viewer + admin Python runtime

## Status

Locked from user answers (2026-08-29). Header tools UX updated (Upload / Python / Output modals). Implement from this file.

## Problem

Admins need a browser IFC viewer (That Open / web-ifc) and a host Python console for future OpenCascade IFC work, without a second Docker service that burns EC2 RAM/CPU.

## Goals

1. **Page:** `/bim/ifc/viewer` — not under `/admin/*`, but **admin-only** (same `IsAdmin` gate as Agent Sandbox).
2. **Viewer:** Astro + **React** client island + `@thatopen/components` (no SvelteKit). Upload IFC in the **browser only** (no server IFC upload v1).
3. **Python API:** `POST /api/bim/python/run` — JWT + admin. Real `python3` subprocess on the **host** (same machine as the Go binary / systemd). **No** extra Docker Compose Python service.
4. **Runtime root:** `backend/bim/bim_runtime/` (override with `BIM_RUNTIME_ROOT`). Scripts may read/write/crawl **only inside that tree** by convention; Go sets `cwd`, `HOME`, `TMPDIR`, and `BIM_RUNTIME_ROOT` to that directory.
5. **IFC args:** Console POSTs metadata of the browser-loaded IFC (`name`, `sizeBytes`, `loaded`, optional client notes). Injected into the process as env `BIM_IFC_ARGS` (JSON). OCC processing of the file itself is **out of scope** for v1.
6. **Header dynamic menu (this page only):** Three controls portal into `#header-dynamic-menu-host` (same pattern as Agent Sandbox / existing Python control):
   - **Upload** — opens a **modal** to choose/upload an IFC file (browser-only). No redundant inline toolbar file input on the page.
   - **Python** — opens a **modal** to edit/run host Python (existing behavior).
   - **Output** — opens a **modal** showing the same stdout/stderr content previously shown in the permanent bottom “Python output” panel. Full console is header-modal driven; no permanent bottom output block.
   The page may keep a **compact status line** (load progress / last run hint). Light sidebar stays on the viewport rail (not in the header menu).
7. **Hello world:** Default / empty-code runs `hello_world.py` under the runtime root (prints hello + echoes `BIM_IFC_ARGS`).
8. **Scene lights (viewer UI):** A rail **icon button** on the viewer viewport toggles a **side panel** with live That Open `SimpleScene` light controls (ambient + directional intensity/color; directional position). Defaults match `world.scene.setup()`; changes apply immediately to the Three.js lights — no server round-trip.
9. **Admin nav:** Global header tray (admin block, after Agent Sandbox) links to `/bim/ifc/viewer` as **BIM IFC viewer**, gated by the same `isPlatformAdmin()` check as other admin links. Not under Services Apps.

## Isolation (host subprocess)

| Control | Rule |
|---------|------|
| No new Docker service | Avoid memory/speed hit on EC2 |
| `exec.Command` | `python3` (or `BIM_PYTHON`), no `shell=True` |
| Working directory | Absolute resolved runtime root |
| Timeout | 15s default (`BIM_PYTHON_TIMEOUT_SEC`) |
| Output cap | 256 KiB combined stdout+stderr |
| Code size | Max 64 KiB source |
| Env | Minimal: `PATH`, `LANG`, `HOME`/`TMPDIR`/`BIM_RUNTIME_ROOT` = runtime, `BIM_IFC_ARGS`, `PYTHONUNBUFFERED=1`; `-I` isolated mode |
| FS | Create `jobs/`, `tmp/`, `out/` under runtime; write job scripts only there; delete job file after run when possible |
| EC2 | No systemd/docker/nginx mutation from this API |

Crawling **within** scripts (e.g. `urllib`) is allowed for research under the runtime tree; scripts must not be treated as a general host admin shell.

## Non-goals

- OpenCascade / IFC file on disk for Python
- Separate Python container
- SvelteKit
- Non-admin access
- Server-side IFC storage

## Acceptance

- [x] Admin opens `/bim/ifc/viewer`, uploads an IFC via **header Upload modal**, sees a That Open scene.
- [x] Non-admin gets client redirect/forbidden; API returns 403.
- [x] Header **Python** modal → run hello world → **Output** modal shows greeting + IFC JSON args (same content as former bottom panel).
- [x] Custom Python runs under `backend/bim/bim_runtime` with timeout/caps.
- [x] No new Docker Compose Python service.
- [x] Light icon on the viewport rail opens/closes a sidebar; ambient/directional intensity, color, and directional position update the live scene.
- [x] Signed-in platform admin sees **BIM IFC viewer** in the global header tray admin block (same gate as Agent Sandbox).
- [x] Header dynamic menu exposes **Upload**, **Python**, and **Output**; page has no permanent bottom Python output block and no inline toolbar upload control (compact status line OK).

## Affected paths

- `specs/037-bim-ifc-viewer/spec.md`
- `backend/bim/bim_runtime/**` (hello_world, README, gitkeep dirs)
- `backend/internal/bim/**`
- `backend/cmd/server/main.go`
- `frontend/src/pages/bim/ifc/viewer.astro`
- `frontend/src/components/BimIfcViewer/**`
- `frontend/src/config/routes.ts`, `frontend/src/lib/routeAccess.ts`
- `frontend/src/components/Header/Header.tsx` (admin nav link)
- `frontend/package.json` (That Open + peers)
