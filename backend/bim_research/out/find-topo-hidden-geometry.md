# Find hidden / double-face geometry on topography (Blender + Bonsai)

That “weird double face” on the brown slope in `/bim/ifc/viewer` is almost always **two faces in the IFC mesh sitting on nearly the same plane** (z-fighting). The viewer cannot invent clean topology — you fix it in Blender before re-exporting IFC.

## What you are looking for

- A second Terrain face under/over the slope (duplicate from Extrude / Boolean / Solidify leftover).
- Terrain top + Street / Sidewalk / Pad sharing the **exact same Z** (coplanar receivers).
- An interior face from a failed boolean that still exists inside the solid.

## Fast checklist (Blender)

1. **Select only Terrain** in the Outliner (hide cars / street / sidewalk with the eye).
2. Tab into **Edit Mode** → face select.
3. **Viewport Overlays → Face Orientation** — red faces are flipped; random flicker on one slope often means two faces.
4. **Select → Select All by Trait → Non Manifold** (and **Interior Faces** if available) — interior leftovers show up here.
5. Orbit in **Wireframe** (`Z` → Wireframe): look for a second silhouette on the slope crest or cut face.
6. Try **Mesh → Clean Up → Merge by Distance** (start very small, e.g. `0.0001`–`0.001` m) — collapses accidental doubles.
7. **Mesh → Clean Up → Delete Loose** / **Degenerate Dissolve**.
8. If the pad/street sits on the terrain top: give the upper slab a tiny real thickness **or** raise it by a few millimeters so it is not coplanar with Terrain.
9. Save IFC (Bonsai), re-upload to `ifcbim/library/` under a **new unique name**, reload the viewer.

## Bonsai-specific tips

- Confirm **one** IFC product for Terrain (`IfcGeographicElement` / TERRAIN) — not two products both representing the same hill.
- Street / Sidewalk should be **separate** products with their own meshes, not coplanar copies of Terrain’s top face.
- After edits: Object tab → check Spatial Container still points at your Site / Storey as intended.

## Viewer vs model

| Symptom | Owner |
|---------|--------|
| Flicker / double triangle on brown slope | **IFC mesh** (this doc) |
| Stripes / acne on beige pad | **Viewer shadows** (bias / first-paint refresh) |
| Soft gray blob on empty paper background | Viewer shadow catcher (normal) |

## Live scene note (Eduardo Blender shot 2026-08-29)

Outliner shows **`IfcGeographicElement/…` (Earth)** plus **`IfcCovering/Street`** and **`IfcCovering/Sidewalk`** under the same storey. The **bright red flickering rectangle on the terrain top** is almost certainly **Earth’s top face + Street/Sidewalk sharing the same plane** (or Face Orientation showing that fight) — not a mystery second Terrain object.

**Do this next:**

1. In the Outliner, click the **eye** on `Street`, then on `Sidewalk`, one at a time.
2. When the red flicker **disappears**, that covering is the coplanar offender.
3. Select that covering → move **Z** up by a few mm (or give it real thickness) so it no longer shares Earth’s top plane.
4. Optional: select Earth alone → Edit Mode → Face Orientation — confirm Earth itself has no interior double face left.

Re-save IFC and re-upload under a new library name.

## Related lab notes

- `backend/bim_research/out/that-open-realistic-shadows.md` — shadows are viewer-side; avoid coplanar receivers.
- `backend/bim_research/out/bonsai-materials-terrain-street.md` — assign Street / Sidewalk as real IFC products.
