# Topic: Semantic IFC topography via Site + geographic location (Blender + Bonsai)

## Problem

Need a clear, citable walkthrough of how to represent **topography** in semantic IFC using **IfcSite** / geographic placement, authored in **Blender + Bonsai**, with links to **official free ISO / buildingSMART** documentation.

## Goals

1. Explain IFC concepts: `IfcSite`, geographic reference (`IfcMapConversion` / CRS), and topography (`IfcGeographicElement` / `IfcSite` terrain representation as applicable to the IFC version used).
2. Step-by-step Blender + Bonsai authoring path.
3. Official free doc links (ISO / buildingSMART), not paywalled dumps.
4. Deliverable: tutorial `.html` under `out/` with:
   - Left chrome: **50px** icon-only bar (header)
   - Left sidebar: reserved for future views
   - Right sidebar: scroll-spy (current heading + position)
   - Route/hash remembers scroll position

## Non-goals

- Production Eduardo OS frontend route
- Editing files outside `backend/bim_research/`
- Claiming ISO HTML is “ISO.org free full text” if only buildingSMART hosts the free schema docs — label sources accurately

## Acceptance

- [x] Local brief committed
- [x] Research notes cite free official links
- [x] `out/` HTML tutorial matches chrome + scroll memory behavior
- [x] Commit/push sandbox-only

## Deliverable

- Tutorial HTML: `backend/bim_research/out/ifc-topography-bonsai-tutorial.html`
- Related Q&A (origin at a corner for That Open): [`../out/ifc-origin-zero-that-open.md`](../out/ifc-origin-zero-that-open.md)

## Findings (summary)

- Topography ≠ Site body: use `IfcGeographicElement` + `TERRAIN`, contained in `IfcSite`.
- Exact geo: `IfcProjectedCRS` + `IfcMapConversion` (IFC4+). Site RefLat/Long = approximate WGS84 only.
- Free schema docs: buildingSMART IFC 4.3 HTML (CC). ISO 16739-1:2024 on iso.org is catalogue + paid PDF; OBP preview only.
- Bonsai: Properties → Geometry → Georeferencing (IfcMapConversion; “Not Georeferenced” = no Projected CRS yet) — not Site Attributes / not Scene→IFC Georeferencing wording from older docs; assign mesh class GeographicElement / TERRAIN.
- Step 7 updated to match Blender 5 + Bonsai screenshot (Geometry fold with Units + Georeferencing; separate from Step 6 RefLatitude).
- Step 7 callout `#epsg-plain`: EPSG/projected CRS explained in plain language; lab may skip survey-grade georef (glossary EPSG row links here).
- Tutorial primary terrain path: hand-model verts + quads/tris (DEM/BlenderGIS optional).
- Sample Site WGS84 hint (Bonsai UI lists): RefLatitude `[10, 28, 50, 0]`, RefLongitude `[-66, -54, -13, 0]`, RefElevation `900.0`, LandTitleNumber `CAT-2026-001-LIBERTADOR`.

## Follow-ups

- [x] Add plain-language glossary for acronyms/jargon in the HTML tutorial (CRS, EPSG, DTM, TIN, WGS84, IFC, ISO, OBP, DEM/DSM, etc.).
- [x] Interactive Bonsai UI mock + rail toggles for left/right tutorial sidebars; lighter body fonts.

## Rail sidebar toggles (verified)

Left 50px `.rail` has two icon buttons that collapse/expand the tutorial sidebars via classes on `.app`:

| Button ID | Controls | Collapse class | Aside |
|-----------|----------|----------------|-------|
| `btn-toggle-nav` | Left Views | `nav-collapsed` | `#side-nav` |
| `btn-toggle-toc` | Right TOC | `toc-collapsed` | `#side-toc` |

JS sets `aria-pressed`, updates title/aria-label (Hide/Show), and persists `{ navOpen, tocOpen }` in `sessionStorage` under `bim-lab:sidebars:<pathname>`.

### Desktop grid (omit collapsed tracks — never use `0` columns)

| State | Classes | `grid-template-columns` |
|-------|---------|-------------------------|
| Both open | — | `var(--rail) var(--nav-w) minmax(0,1fr) var(--toc-w)` |
| Left only collapsed | `nav-collapsed` | `var(--rail) minmax(0,1fr) var(--toc-w)` |
| Right only collapsed | `toc-collapsed` | `var(--rail) var(--nav-w) minmax(0,1fr)` |
| Both collapsed | `nav-collapsed toc-collapsed` | `var(--rail) minmax(0,1fr)` |

Collapsed asides use `display:none` so they do not occupy auto-placement slots.
