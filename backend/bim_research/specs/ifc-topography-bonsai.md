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
- [ ] Commit/push sandbox-only

## Deliverable

- Tutorial HTML: `backend/bim_research/out/ifc-topography-bonsai-tutorial.html`

## Findings (summary)

- Topography ≠ Site body: use `IfcGeographicElement` + `TERRAIN`, contained in `IfcSite`.
- Exact geo: `IfcProjectedCRS` + `IfcMapConversion` (IFC4+). Site RefLat/Long = approximate WGS84 only.
- Free schema docs: buildingSMART IFC 4.3 HTML (CC). ISO 16739-1:2024 on iso.org is catalogue + paid PDF; OBP preview only.
- Bonsai: Scene → IFC Georeferencing; assign mesh class GeographicElement / TERRAIN.
