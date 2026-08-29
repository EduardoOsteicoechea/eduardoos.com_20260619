# IFC origin at a chosen corner (Blender + Bonsai → That Open)

Plain-language notes from a recent Q&A. Goal: put a **chosen corner of the mesh at absolute world zero** in IFC so That Open viewers treat that point as the origin.

---

## 1. That Open vs Bonsai label

The green text in Blender that looks like **`IfcProject/My Project`** is a **Bonsai** overlay (IFC project label in the 3D viewport).

- It is **not** a That Open Company logo.
- It will **not** appear in That Open web viewers.
- Seeing that label only means you are in Blender with Bonsai’s IFC UI turned on.

---

## 2. Why the model may look “off-grid” in That Open

Two common causes (often both):

### (a) Mesh already rotated vs Blender axes

The geometry may have been imported or modeled with a rotation that does not match Blender’s world axes. In Blender it can look “upright” because of object/parent transforms; in a viewer that reads raw IFC placement, it can sit tilted or shifted.

### (b) Y-up vs Z-up

| World | “Up” axis |
|-------|-----------|
| IFC / Blender | **Z** up |
| Three.js (typical That Open stack) | **Y** up |

Viewers convert Z-up IFC into Y-up for WebGL. That conversion is normal. If the IFC origin or rotation is already wrong, the model can look further off the grid after the axis swap.

**Takeaway:** Fix placement and origin in Blender/IFC first; then reload in That Open.

---

## 3. Set a chosen corner as absolute zero in IFC

Do this so That Open uses that corner as the model origin `(0, 0, 0)`.

1. **Edit Mode** → select the **corner vertex** you want as zero.
2. **Shift+S** → **Cursor to Selected** (3D Cursor jumps to that vertex).
3. **Object Mode** → **Object → Set Origin → Origin to 3D Cursor**  
   (object origin now sits on that corner).
4. **Clear Location** so the object origin (your corner) sits at **world `0, 0, 0`**. Prefer the menu or N-panel — do **not** rely on a keyboard shortcut:
   - **Object Mode** → **Object → Clear → Location**, or
   - Sidebar (**N**) → **Item** → **Transform** → set **Location** X/Y/Z to **0**.
   - Shortcuts (e.g. Blender Default vs Industry Compatible) vary by keymap; menu / N-panel always work (Blender 5.x + Bonsai included).
5. **Ctrl+A** → **Apply** → **Rotation & Scale** (bake transforms so IFC export matches what you see).
6. **Save / write the IFC** from Bonsai.
7. **Reload** that IFC file in the That Open viewer.

### If it still looks offset

- Hard-reload the viewer / clear any cached IFC so you are not seeing an old file.
- **Georeferencing** (map CRS / `IfcMapConversion`) is a separate topic. If Bonsai shows **Not Georeferenced**, an origin offset is usually from mesh/object placement, not from survey georef.
- See **§5 Still off?** below (viewer first-vertex shift vs Blender Location vs IFC points).

---

## 4. Checklist

- [ ] Chose the corner vertex that should be absolute zero
- [ ] 3D Cursor → that vertex (Shift+S → Cursor to Selected)
- [ ] Origin → 3D Cursor
- [ ] Clear location via Object → Clear → Location (or N-panel Location = 0) so corner is at world 0,0,0
- [ ] Applied rotation & scale (Ctrl+A)
- [ ] **Updated IFC geometry / representation** in Bonsai (edit-mode change committed; not only Object Location)
- [ ] Saved IFC and reloaded in That Open / Eduardo OS `/bim/ifc/viewer`
- [ ] If still wrong: cache/reload checked; georef not blamed when “Not Georeferenced”; verify IFC vertex near 0 (see §5)

---

## 5. Still off? (Eduardo OS viewer vs Blender)

When Blender+Bonsai shows Terrain (`IfcGeographicElement`) with **Location 0,0,0**, **Rotation 0**, and a corner on world origin, but `/bim/ifc/viewer` still looks diagonal / not on the grid at absolute zero, use this section.

### Viewer may shift the model (That Open / Fragments)

Eduardo OS uses `@thatopen/components` → Fragments `IfcImporter`. By default Fragments sets web-ifc **`COORDINATE_TO_ORIGIN: true`**, which **translates the mesh so the first tessellated vertex sits at scene (0,0,0)** — **not** IFC world `(0,0,0)`.

| What you see | What it means |
|--------------|----------------|
| UI grid origin | Three.js / That Open scene origin (grid from `OBC.Grids`) |
| IFC `(0,0,0)` with default Fragments import | Often **not** at grid center — shifted by “first vertex” |
| Camera default in Eduardo OS | Looks from ~(12, 8, 12) toward (0, 0, 0) — models can look **diagonal** even when origin is correct |

Eduardo OS `BimIfcViewer` also calls `ifcLoader.load(data, false, …)` (`coordinate=false`): that only skips **multi-model** re-coordination; it does **not** by itself disable first-vertex origin shift.

**Product fix (spec 037):** `BimIfcViewer` sets `COORDINATE_TO_ORIGIN: false` on the importer so IFC world origin stays at the grid/scene origin. Rebuild/redeploy frontend to pick this up; until then, a correct IFC can still look “off” the grid on an older build.

There is **no** extra fit-to-box / bounding-box centering in `BimIfcViewer` after load — models are added as-is (`world.scene.three.add(model.object)`). Grid is created at world origin; camera target is `(0,0,0)`.

### How to verify IFC origin (file vs viewer)

1. Open the `.ifc` in a text editor / IFC viewer and search a corner vertex / cartesian point you expect near zero — e.g. `IFCCARTESIANPOINT((0.,0.,0.))` or values within a few mm of zero on the chosen corner.
2. In Blender Edit Mode, select that corner and read **Global** coordinates in the N-panel (should be ~0,0,0 after a correct bake).
3. In Eduardo OS viewer (with `COORDINATE_TO_ORIGIN=false`): the same corner should sit on the grid cross at scene origin. On older builds that left Fragments’ default `true`, expect a shift even if the IFC is correct.
4. If Blender object Location is 0 but IFC points are still large/offset → Bonsai did not rewrite geometry yet (next subsection).

### Bonsai caveat: Location 0 ≠ IFC points updated

Clearing **Object → Location** to `0,0,0` in Blender updates the Blender object transform. It does **not always** rewrite IFC cartesian points / object placements until geometry is **committed** to IFC:

- Enter **Edit Mode**, make a no-op or real mesh edit if needed, then leave Edit Mode so Bonsai updates the representation.
- Or use Bonsai’s geometry / update representation actions for that product version.
- Then **save the IFC** and reload in the web viewer.

Until that happens, Blender can look correct while That Open still shows the old IFC coordinates.

### Practical checks

1. Confirm corner **Global** ~0 in Blender Edit Mode.
2. Confirm IFC file contains near-zero cartesian data for that corner (or re-save after representation update).
3. Hard-reload `/bim/ifc/viewer` and upload the **same** file again (no stale browser cache of an older convert).
4. Expect Y-up display (IFC Z-up → Three.js Y-up); origin should stay put; orientation vs Blender axes can still look different.
5. If the mesh looks tilted/diagonal but the corner sits on the grid origin, fix **rotation in IFC** (apply rotation in Blender, update representation) — not georef.
6. If still shifted after a build that disables `COORDINATE_TO_ORIGIN`, treat it as an IFC placement/geometry problem, not the UI grid.

---

*Lab deliverable — related brief: [`../specs/ifc-topography-bonsai.md`](../specs/ifc-topography-bonsai.md).*
