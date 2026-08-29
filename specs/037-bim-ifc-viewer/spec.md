# Feature 037 — BIM IFC viewer + admin Python runtime

## Status

Locked from user answers (2026-08-29). Viewport chrome polish (2026-08-29): full-bleed stage, no That Open logo, icon-only header tools, Offload model. Shadows + sun controls (2026-08-29). **Default lighting restored to true original (2026-08-29):** That Open `SimpleScene` + plain `setup()` as first shipped in `886ebc8` — not ShadowedScene with re-derived `(5,10,3)` while shadows-off. Implement from this file.

## Problem

Admins need a browser IFC viewer (That Open / web-ifc) and a host Python console for future OpenCascade IFC work, without a second Docker service that burns EC2 RAM/CPU.

## Goals

1. **Page:** `/bim/ifc/viewer` — not under `/admin/*`, but **admin-only** (same `IsAdmin` gate as Agent Sandbox).
2. **Viewer:** Astro + **React** client island + `@thatopen/components` (no SvelteKit). Upload IFC in the **browser only** (no server IFC upload v1).
   - **IFC world origin:** Load with Fragments/web-ifc `COORDINATE_TO_ORIGIN: false` so IFC cartesian `(0,0,0)` stays at the scene/grid origin (do **not** shift by “first vertex”). Keep `ifcLoader.load(..., coordinate=false, ...)` so models are not re-centered relative to each other. Z-up→Y-up conversion remains normal and does not move the origin. Note: very large absolute coordinates may show float jitter; that is acceptable for this admin/origin-check use case.
3. **Python API:** `POST /api/bim/python/run` — JWT + admin. Real `python3` subprocess on the **host** (same machine as the Go binary / systemd). **No** extra Docker Compose Python service.
4. **Runtime root:** `backend/bim/bim_runtime/` (override with `BIM_RUNTIME_ROOT`). Scripts may read/write/crawl **only inside that tree** by convention; Go sets `cwd`, `HOME`, `TMPDIR`, and `BIM_RUNTIME_ROOT` to that directory.
5. **IFC args:** Console POSTs metadata of the browser-loaded IFC (`name`, `sizeBytes`, `loaded`, optional client notes). Injected into the process as env `BIM_IFC_ARGS` (JSON). OCC processing of the file itself is **out of scope** for v1.
6. **Header dynamic menu (this page only):** Controls portal into `#header-dynamic-menu-host` (same pattern as Agent Sandbox). **Icon-only** buttons (no visible text labels); keep `title` + `aria-label` for a11y — match Agent Sandbox / Scrib header-dynamic-menu pattern:
   - **Upload** — opens a **modal** to choose/upload an IFC file (browser-only). No redundant inline toolbar file input on the page.
   - **Python** — opens a **modal** to edit/run host Python (existing behavior).
   - **Output** — opens a **modal** showing the same stdout/stderr content previously shown in the permanent bottom “Python output” panel. Full console is header-modal driven; no permanent bottom output block.
   - **Offload model** — clears/disposes the currently loaded IFC/fragments from the browser scene only (no server call). Resets IFC metadata (`loaded: false`, clear name/size), updates status, leaves viewer ready for a new upload. Disabled or no-op when nothing is loaded.
   The page may keep a **compact status line** (load progress / last run hint). Light sidebar stays on the viewport rail (not in the header menu).
7. **Hello world:** Default / empty-code runs `hello_world.py` under the runtime root (prints hello + echoes `BIM_IFC_ARGS`).
8. **Scene lights (viewer UI):** A rail **icon button** on the viewer viewport toggles a **side panel** with live That Open light controls. Changes apply immediately — no server round-trip. Sidebar fieldsets:
   - **Ambient** — intensity, color.
   - **Directional** — intensity, color (sun “brightness” / tint).
   - **Sun** — elevation ° (above horizon) and azimuth ° (from +Z toward +X on the Y-up scene). These derive the directional light **direction** vector; raw Pos X/Y/Z sliders are **hidden** (not shown). When sun angles change on **SimpleScene**, apply to `world.scene.config.directionalLight.position`. When on **ShadowedScene**, also refresh shadows.
   - **Shadows** — enable/disable, shadow map resolution (e.g. 512 / 1024 / 2048 / 4096), and bias (stripe-artifact control). Reset restores the original SimpleScene lighting path + sidebar defaults together.
9. **Default scene lighting (true original — git `886ebc8`):** First paint and **Reset lights** must use That Open **`SimpleScene`** with **plain `setup()`** (no config argument) and `world.scene.three.background = null`. Do **not** post-apply custom intensities/colors/positions after that initial `setup()` — the first viewer never did (`lightsApi.apply` / `DEFAULT_LIGHTS` overwrite came later with the light sidebar and was wrong to keep on ShadowedScene). Sidebar React defaults may still document SimpleScene `_defaultConfig` (ambient `1` / directional `1.5` / position `(5,10,3)`, sun angles derived from that vector) for when the user moves sliders; shadows start **off**. Do **not** use ShadowedScene tutorial samples (directional intensity `4` / position `(5,10,5)`) as defaults.
10. **Scene class vs shadows (option A):**
    - **Shadows off (default):** Keep / restore **`SimpleScene`**. Sun and intensity/color sliders mutate `world.scene.config` only. No cascade shadow lights, no shadow ground plane, no `shadowMap` requirement for the original look.
    - **Shadows on:** Switch `world.scene` to That Open **`ShadowedScene`** (migrate non-light scene children so loaded models/grid survive), enable `SimpleRenderer` shadow maps (`shadowMap.enabled`, **`VSMShadowMap`**), call `setup` with cascade `1` + resolution (default **2048**), `autoBias = false`, bias default **`-0.002`**, `shadowsEnabled = true`. Soft fill: keep sidebar ambient/directional intensities (SimpleScene-scale; do **not** force tutorial directional `4`). Opaque fragment tiles / meshes: `castShadow` + `receiveShadow` (re-apply after load **and** when switching to ShadowedScene). Large Y=0 `ShadowMaterial` ground plane receives shadows. Call **`updateShadows()`** after setup, model load, sun/bias/map-size changes, and camera controls **`rest`** — **not** on every camera `update` (too hot; fragments still update on `update`). When writing sun direction into ShadowedScene config, do **not** leave cascade lights parked at the sun vector (That Open `DirectionalLightConfig.position` stomps CSM); refresh via `updateShadows` (clear in-flight lock if needed so slider bursts cannot skip the refresh). Turning shadows **off** switches back to **`SimpleScene`** (plain `setup()` then re-apply the user’s current ambient/directional/sun settings so sliders stay live).
    - **Wrong prior approach (do not regress):** Staying on `ShadowedScene` with `shadowsEnabled = false` and “parking” cascade lights at `(5,10,3)` is **not** the original look — cascade/CSM lighting still differs from SimpleScene.
11. **Admin nav:** Global header tray (admin block, after Agent Sandbox) links to `/bim/ifc/viewer` as **BIM IFC viewer**, gated by the same `isPlatformAdmin()` check as other admin links. Not under Services Apps.
12. **Full-bleed viewport:** The 3D stage fills the available page content area edge-to-edge (no outer padding/border gap around the canvas separating it from the header rail / page edges). Respect desktop left site-header rail via existing `--header_width` / main layout tokens — do not underlap the rail.
13. **No third-party logo watermark:** Hide/disable the That Open Company logo overlay (`world.renderer.showLogo = false` or equivalent). Viewport stays clean without breaking the viewer.

### Sun direction math (Y-up Three.js)

Given elevation \(e\) (degrees above horizon) and azimuth \(a\) (degrees from **+Z** toward **+X**), with fixed direction length \(r\) (default matches legacy light position magnitude ≈ 11.58):

- \(x = r \cdot \cos(e) \cdot \sin(a)\)
- \(y = r \cdot \sin(e)\)
- \(z = r \cdot \cos(e) \cdot \cos(a)\)

`ShadowedScene` (when shadows are on) treats this vector as the sun **direction** (normalized internally when recomputing cascaded shadow lights). On **SimpleScene** (default), the same vector is the directional light **position**. Defaults chosen so the initial direction matches SimpleScene `_defaultConfig` at `(5, 10, 3)`.

## Acceptance (lights defaults)

- [x] Default / Reset lights use **SimpleScene + plain `setup()`** (original `886ebc8` path); shadows off; no ShadowedScene until the user enables Shadows.
- [x] Sidebar nominal defaults document ambient `1` `#ffffff`, directional `1.5` `#ffffff`, sun from `(5, 10, 3)`; enabling Shadows switches to ShadowedScene + VSM + ground + shadow maps (map size 2048, bias -0.002) without forcing harsh tutorial intensities.
- [x] With Shadows on: fragment cast/receive re-applied; `updateShadows` on load / sun change / camera **rest** (not every camera `update`).

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
- [x] Light icon on the viewport rail opens/closes a sidebar; ambient/directional intensity and color update the live scene.
- [x] Lights sidebar includes **Sun** (elevation °, azimuth °) that updates directional light direction; raw Pos X/Y/Z controls are not shown.
- [x] Lights sidebar includes **Shadows** (enable, map resolution, bias); enabling Shadows switches to `ShadowedScene` + **VSM** shadow maps + ground receiver; loaded model meshes cast/receive (re-applied on enable); turning Shadows off restores `SimpleScene`.
- [x] With Shadows on: `updateShadows()` runs after load, sun/shadow setting changes, and camera **`rest`** (not every camera `update`); defaults map size **2048**, bias **-0.002**; soft SimpleScene-scale intensities.
- [x] Default / Reset lights restore original **SimpleScene + plain `setup()`** (not ShadowedScene-with-shadows-off); shadows start **off**.
- [x] Signed-in platform admin sees **BIM IFC viewer** in the global header tray admin block (same gate as Agent Sandbox).
- [x] Header dynamic menu exposes **Upload**, **Python**, and **Output**; page has no permanent bottom Python output block and no inline toolbar upload control (compact status line OK).
- [x] 3D viewport is full-bleed in the page content area (no outer padding/border gap around the canvas; desktop left rail still respected via layout tokens).
- [x] That Open Company logo/watermark is not visible in the viewport.
- [x] Header dynamic menu tools (Upload / Python / Output / Offload model) are **icon-only** with `title` + `aria-label`.
- [x] **Offload model** disposes browser-loaded IFC/fragments, resets metadata (`loaded: false`, clear name/size), updates status, and leaves the viewer ready for upload; disabled/no-op when nothing is loaded.
- [x] IFC world `(0,0,0)` maps to the viewer grid/scene origin (no first-vertex `COORDINATE_TO_ORIGIN` shift; `load` uses `coordinate=false`).

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
