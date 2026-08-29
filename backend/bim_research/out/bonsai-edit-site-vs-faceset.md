# Why Bonsai IFC editing feels broken (Site vs FaceSet vs Storey)

## The confusion you’re seeing

In the Outliner you can have **both**:

| What you see | What it actually is |
|--------------|---------------------|
| `IfcSite/My Site` → `Terrain`, `Street`, `Sidewalk` | **IFC products** (real BIM objects) — correct place for site elements |
| `IfcBuildingStorey/My Storey` → `Item/IfcPolygonalFaceSet/242` | **Geometry leftover / orphan** — not a product; often from a failed edit or a mesh that lost its product link |

So: **products under Site = good.**  
**Lone FaceSet under Storey = junk / broken link**, not “the sidewalk lives in the storey.”

You do **not** put FaceSets into Site as containers. FaceSets are **shape data inside** a product’s representation.

---

## “But the FaceSet *is* the actual geometry” — yes

Correct. In IFC:

```
IfcCovering / IfcGeographicElement   ← PRODUCT (who / where / material / Spatial Container)
 └── Representation → Body / Tessellation
      └── IfcPolygonalFaceSet        ← GEOMETRY (verts + faces — the mesh you see)
```

So when you select `Item/IfcPolygonalFaceSet/242` and see the grey slab in the viewport, you **are** looking at the triangle data. That does **not** mean:

- the sidewalk “lives in” the storey, or  
- you should edit / contain / save that FaceSet as if it were the sidewalk.

**Analogy:** FaceSet = the PNG pixels. Product = the photo file (name, folder, EXIF). Outliner under Storey for a lone FaceSet = the pixels floating outside the file.

Bonsai still needs the **product** selected because:

| Action | Needs product | FaceSet alone |
|--------|---------------|---------------|
| Spatial Container = Site | yes | no (no container) |
| Materials / Styles | yes | no |
| Manually Save Representation | yes | → `assert product` |
| Delete orphan cleanup | — | delete FaceSet if stranded |

If Terrain/Street/Sidewalk under **Site** still show the same mesh when selected, FaceSet/242 under Storey is almost certainly a **stranded Blender item** from an edit session — delete it after you confirm products still look right.

---

## Two different trees (why it feels dual)

### 1. Spatial containment (BIM meaning)

```
IfcProject
 └── IfcSite          ← Terrain / Street / Sidewalk should be HERE (contained in Site)
      └── IfcBuilding
           └── IfcBuildingStorey   ← walls, slabs, rooms — not outdoor terrain
```

**Spatial Container** = which spatial object **contains** the product.

### 2. Blender Outliner collections (viewport organisation)

Bonsai also dumps mesh datablocks / representation items into collections. After errors (`assert product`, “Geometry changes will be lost”), you can get:

- a **product** still under Site, and  
- a **detached** `IfcPolygonalFaceSet/...` object under Storey or Unsorted  

That FaceSet is **not** the Spatial Container of the sidewalk. It’s a stranded Blender object Bonsai created while editing geometry.

---

## Why editing feels always problematic

1. **IFC products ≠ free Blender meshes**  
   Dimensions / Edit Mode without a proper save → Bonsai reloads IFC mesh → **snap back**.

2. **`assert product` / “Geometry changes will be lost”**  
   You edited or ran **Manually Save Representation** on a **FaceSet object** (or a mesh with no product). Bonsai needs the **product** selected (`IfcGeographicElement`, `IfcCovering`, …).

3. **Types vs occurrences**  
   `IfcGeographicElementType` has **no** Spatial Container. Only occurrences do.

4. **Tessellation workflow is awkward**  
   Outdoor freeform mesh → `IfcPolygonalFaceSet`. Edit path is fragile: edit product mesh → save representation → save IFC. One wrong selection leaves orphans under Storey.

5. **Default collection = Storey**  
   New meshes often spawn under “Default: My Storey” even if you later assign Spatial Container = Site. Outliner location and IFC containment can disagree until cleaned up.

---

## What you should do with `IfcPolygonalFaceSet/242` under Storey

1. Select **`IfcGeographicElement/Terrain`** (and Coverings) — confirm they look right.  
2. If FaceSet/242 is a **duplicate orphan** (green box, not needed): **delete** that FaceSet object.  
3. Do **not** try to “move FaceSet into Site” as if it were a product.  
4. Future edits: select **Terrain / Street / Sidewalk** only → reshape → **Manually Save Representation** on the **product** → Save IFC.

---

## Reliable lab pattern (less pain)

1. Model as **plain Blender mesh** first (no IFC).  
2. When shape is final: assign IFC class + Spatial Container = **Site**.  
3. Avoid repeated “edit IFC tessellation” cycles.  
4. If edit breaks: **new mesh → re-assign class → delete orphan FaceSets**.

---

## Checklist

- [ ] Products (Terrain, Street, Sidewalk) under **Site** in Outliner / Spatial Container = Site  
- [ ] No stray `Item/IfcPolygonalFaceSet/...` under Storey (delete orphans)  
- [ ] Never run mesh-save on a FaceSet-only selection  
- [ ] Object Information header shows product class, not `…Type` and not FaceSet  

Editing isn’t “always wrong” — IFC separates **product** (who/where) from **representation** (triangles). Bonsai’s UI makes that easy to mix up; orphans under Storey are the symptom.
