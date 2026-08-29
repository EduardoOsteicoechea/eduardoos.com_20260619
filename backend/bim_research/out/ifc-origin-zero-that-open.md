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

---

## 4. Checklist

- [ ] Chose the corner vertex that should be absolute zero
- [ ] 3D Cursor → that vertex (Shift+S → Cursor to Selected)
- [ ] Origin → 3D Cursor
- [ ] Clear location via Object → Clear → Location (or N-panel Location = 0) so corner is at world 0,0,0
- [ ] Applied rotation & scale (Ctrl+A)
- [ ] Saved IFC and reloaded in That Open
- [ ] If still wrong: cache/reload checked; georef not blamed when “Not Georeferenced”

---

*Lab deliverable — related brief: [`../specs/ifc-topography-bonsai.md`](../specs/ifc-topography-bonsai.md).*
