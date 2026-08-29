# Bonsai right bar + materials (Terrain / Sidewalk / Street)

## Where is the “Bonsai right bar”?

Bonsai does **not** use a separate app chrome like the tutorial HTML. In Blender it uses the normal **Properties** strip on the **right**.

1. Close the **Visible Tabs** popover if it’s open (it blocks the icons).
2. Look at the **vertical icon column** on the far right of Properties.
3. Important Bonsai-related tabs:
   - **Scene** (cone/cylinder / scene icon) → **Project Overview** (Spatial, Georeferencing under Geometry, etc.)
   - **Object** (orange square) → switch the dropdown at the top of that tab to **Object Information** / Geometry and Materials (Bonsai panels for the **selected** object)

Also useful: the **left** vertical toolbar inside the 3D Viewport (walls, slabs, …) is Bonsai **creation tools**, not materials.

**Rule:** select an object in the Outliner/viewport first, then use **Object** tab on the right to edit that object’s IFC data and materials.

---

## Before materials: make Sidewalk / Street into IFC products

In your Outliner, **Terrain** may already be IFC; **Sidewalk** and **Street** often start as plain Blender meshes.

For each of Sidewalk and Street:

1. Select the mesh.
2. Right → **Object** tab → Bonsai **assign IFC class** (same flow as terrain).
3. Suggested classes for a lab:
   - **Street** → `IfcPavement` or `IfcSlab` (if Pavement unavailable) — road surface  
   - **Sidewalk** → `IfcPavement` / `IfcSlab` / `IfcCovering` — walk surface  
   - **Terrain** → already `IfcGeographicElement` + `TERRAIN`
4. **Spatial Container** → `IfcSite/My Site` (Object Information → Spatial Container).
5. Save IFC when done.

---

## Assign asphalt / slab-like materials (IFC Styles)

Do this **per object** (Terrain, then Sidewalk, then Street).

### A. Create materials

1. Select **Terrain**.
2. Right → **Object** tab → find **Materials** (under Geometry and Materials / Object Materials — scroll).
3. **`+`** add material, name it e.g. `Earth` (brown soil) or keep one shared `Asphalt` if you prefer grey for roads only.
4. Select **Street** → add/assign material named e.g. `Asphalt`.
5. Select **Sidewalk** → add/assign material named e.g. `Concrete` or `AsphaltLight`.

Use the **brush** “Assign Material To Selected” so the count next to the material is not `0`.

### B. Add colour (Styles)

Colour is under **Styles**, not only the material name:

1. Same Object/Geometry area → expand **Styles**.
2. **`+`** create `IfcSurfaceStyle` (e.g. `AsphaltColour`).
3. Under **Shading**:
   - Enable **Shade**
   - Set **Surface Colour** (asphalt ≈ dark grey `0.15, 0.15, 0.15`; concrete ≈ light grey; earth ≈ brown)
   - Click **Save Shading Style**
4. Optionally enable **Render** + **Save Rendering Style** for Material Preview (still may not match Eevee perfectly).
5. Link the style to the material / object as your Bonsai build allows.

Repeat for each material (Earth / Asphalt / Concrete).

### C. Save

**File → Save IFC** (or save project). Viewport **Solid** shading shows IFC Shade colours more reliably than Material Preview.

---

## Quick map

| Object    | IFC class (lab)              | Material name | Colour hint   |
|-----------|------------------------------|---------------|---------------|
| Terrain   | `IfcGeographicElement` TERRAIN | Earth       | Brown         |
| Street    | `IfcPavement` or `IfcSlab`   | Asphalt       | Dark grey     |
| Sidewalk  | `IfcPavement` / `IfcSlab`    | Concrete      | Light grey    |

---

## If you still don’t see Materials / Styles

- You’re on **Tool** tab (wrench) — switch to **Object** (orange square) or **Scene**.
- Nothing selected, or you selected Site instead of Street/Sidewalk/Terrain.
- Sidewalk/Street still have no IFC class — assign class first, then materials.
