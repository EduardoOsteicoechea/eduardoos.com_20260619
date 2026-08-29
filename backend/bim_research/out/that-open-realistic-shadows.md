# Realistic shadows (That Open / Three.js) for Terrain · Street · Sidewalk

## Short answer

On **eduardoos.com `/bim/ifc/viewer`**, shadows are already wired via That Open **`ShadowedScene`** + Three.js shadow maps (spec **037**). They start **off**. Turn them on in the viewer lights panel — you do **not** bake shadows into the IFC file.

IFC stores geometry + materials. **Lights and shadows are viewer/Three.js**, not Bonsai.

---

## In the Eduardo OS viewer (what you already have)

1. Open `/bim/ifc/viewer` and load your IFC (terrain + street + sidewalk).
2. Click the **lights** icon on the viewer rail (opens the lights side panel).
3. **Shadows → enable** (switches scene to That Open `ShadowedScene`).
4. Tune for a more “realistic” look:
   - **Sun elevation °** — higher = shorter shadows; lower = long dusk shadows  
   - **Sun azimuth °** — rotate light around the model  
   - **Shadow map size** — `2048` or `4096` (sharper, heavier)  
   - **Shadow bias** — if you see stripes/acne, nudge bias (e.g. around `-0.002`)  
   - Directional intensity — not too harsh vs ambient (soft fill)
5. Orbit, then let the camera **rest** so cascaded shadows can refresh (`updateShadows`).

Defaults: SimpleScene, shadows **off**. Reset lights restores that.

---

## What “realistic” means here

| Layer | Who owns it |
|-------|-------------|
| Mesh (terrain, street, sidewalk) | IFC / Bonsai |
| Colours / materials | IFC styles (limited) + viewer |
| Sun direction, soft shadows, ground receiver | **Three.js / That Open viewer** |

That Open uses a **directional (sun) light** + shadow maps (often **VSM**), plus a ground plane that **receives** shadows. Opaque fragment meshes **cast** and **receive**. That is the standard “realistic enough” BIM web look — not Cycles path tracing.

---

## Mesh tips so shadows look good

- Give sidewalk/street a little **thickness** and fix **normals** (blue top from above).  
- Avoid coplanar faces (z-fighting breaks shadow receivers).  
- Keep models near a sensible origin (your IFC origin work).  
- Very large extents need higher shadow map size or shadows look blocky.

---

## Raw Three.js / That Open (if you build your own app)

Conceptually the same stack Eduardo OS uses:

1. Use That Open **`ShadowedScene`** (not only `SimpleScene`).  
2. `renderer.shadowMap.enabled = true` (e.g. `VSMShadowMap`).  
3. Directional light as sun; set `castShadow`.  
4. On meshes: `castShadow = true`, `receiveShadow = true`.  
5. Ground / terrain receives shadows.  
6. Call scene **`updateShadows()`** after load and when the sun moves.

See That Open docs for `ShadowedScene` / fragments shadow samples; Eduardo OS implementation: `frontend/src/components/BimIfcViewer/BimIfcViewer.tsx` + `specs/037-bim-ifc-viewer/spec.md`.

---

## Not in IFC

Do **not** expect Bonsai to “export realistic shadows” into the `.ifc`. Export clean geometry + materials; enable shadows in the **viewer**.
