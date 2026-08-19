/**
 * That Open Company + Three.js IFC viewer island.
 * Initializes Fragments, converts IFC with IfcLoader, mounts the model in a world,
 * and keeps Fragments in sync with camera controls so geometry stays visible after
 * fitToItems / orbit (That Open requires fragments.core.update on camera "update").
 *
 * WASM for web-ifc is served from same-origin /web-ifc/ (copied via postinstall).
 * Errors stay in-panel so the surrounding OpenBIM page does not blank.
 */

import { useEffect, useRef, useState } from "react";
import "./IfcViewer.css";

type IfcViewerProps = {
  buffer: Uint8Array | null;
  modelName: string;
};

type FragmentsModelLike = {
  useCamera?: (cam: unknown) => void;
  object?: unknown;
};

function readSceneBackground(): number {
  if (typeof document === "undefined") return 0x0c1118;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--site-body-bg")
    .trim();
  if (!raw) return 0x0c1118;
  // Accept #rgb / #rrggbb from theme tokens.
  const hex = raw.startsWith("#") ? raw.slice(1) : "";
  if (hex.length === 3) {
    const expanded = hex
      .split("")
      .map((c) => c + c)
      .join("");
    const n = Number.parseInt(expanded, 16);
    return Number.isFinite(n) ? n : 0x0c1118;
  }
  if (hex.length === 6) {
    const n = Number.parseInt(hex, 16);
    return Number.isFinite(n) ? n : 0x0c1118;
  }
  return 0x0c1118;
}

export default function IfcViewer({ buffer, modelName }: IfcViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState("");

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !buffer) {
      setStatus("");
      setFailed("");
      return;
    }

    let disposed = false;
    let components: { dispose?: () => void } | null = null;
    let removeCameraUpdate: (() => void) | null = null;

    void (async () => {
      setFailed("");
      setStatus("Starting That Open viewer…");
      try {
        const THREE = await import("three");
        const OBC = await import("@thatopen/components");
        if (disposed) return;

        // Own copy so WASM/worker transfer cannot detach the React-owned buffer.
        const bytes = new Uint8Array(buffer);

        const comps = new OBC.Components();
        components = comps;

        const worlds = comps.get(OBC.Worlds);
        const world = worlds.create<
          InstanceType<typeof OBC.SimpleScene>,
          InstanceType<typeof OBC.OrthoPerspectiveCamera>,
          InstanceType<typeof OBC.SimpleRenderer>
        >();

        world.scene = new OBC.SimpleScene(comps);
        world.scene.setup();
        world.scene.three.background = new THREE.Color(readSceneBackground());

        world.renderer = new OBC.SimpleRenderer(comps, host);
        world.camera = new OBC.OrthoPerspectiveCamera(comps);
        // Orbit-friendly starting frame; fitToItems refines after load.
        await world.camera.controls.setLookAt(12, 8, 12, 0, 0, 0);

        comps.init();
        comps.get(OBC.Grids).create(world);
        // Avoid a 0×0 first paint if layout settled after the host mounted.
        world.renderer.resize();

        const fragments = comps.get(OBC.FragmentsManager);
        fragments.init(await OBC.FragmentsManager.getWorker());

        // Required by That Open: Fragments rebuild visible meshes from the active
        // camera. Without this, fitToItems / orbit leave an empty canvas while
        // metadata/info still works.
        const onCameraUpdate = () => {
          void fragments.core.update();
        };
        world.camera.controls.addEventListener("update", onCameraUpdate);
        removeCameraUpdate = () => {
          world.camera.controls.removeEventListener("update", onCameraUpdate);
        };

        // Soften z-fighting between coplanar IFC faces (official tutorial pattern).
        fragments.core.models.materials.list.onItemSet.add(({ value: material }) => {
          if (!("isLodMaterial" in material && material.isLodMaterial)) {
            material.polygonOffset = true;
            material.polygonOffsetUnits = 1;
            material.polygonOffsetFactor = Math.random();
          }
        });

        const mountModel = async (model: FragmentsModelLike) => {
          if (typeof model.useCamera === "function") {
            model.useCamera(world.camera.three);
          }
          if (model.object) {
            world.scene.three.add(model.object as never);
          }
          await fragments.core.update(true);
        };

        fragments.list.onItemSet.add(({ value: model }) => {
          void mountModel(model as FragmentsModelLike);
        });

        const ifcLoader = comps.get(OBC.IfcLoader);
        await ifcLoader.setup({
          autoSetWasm: false,
          wasm: {
            // Same-origin copy of node_modules/web-ifc/*.wasm (see scripts/copy-web-ifc-wasm.mjs).
            path: "/web-ifc/",
            absolute: true,
          },
        });
        if (disposed) return;

        setStatus("Converting IFC to fragments…");
        // coordinate=false matches That Open IfcLoader tutorial; auto-coordinate
        // can leave the mesh far from the fitted camera frame on some files.
        const model = await ifcLoader.load(bytes, false, modelName || "model");
        if (disposed) return;

        await mountModel(model as FragmentsModelLike);
        try {
          await world.camera.fitToItems();
        } catch {
          /* fit is best-effort if bounds are empty */
        }
        // fitToItems moves the camera — force a Fragments refresh for the new view.
        await fragments.core.update(true);
        world.renderer.resize();
        if (!disposed) setStatus("");
      } catch (err) {
        if (!disposed) {
          setStatus("");
          setFailed(err instanceof Error ? err.message : "IFC viewer failed");
        }
      }
    })();

    return () => {
      disposed = true;
      try {
        removeCameraUpdate?.();
      } catch {
        /* listener teardown is best-effort */
      }
      try {
        components?.dispose?.();
      } catch {
        /* viewer teardown is best-effort */
      }
      host.replaceChildren();
    };
  }, [buffer, modelName]);

  return (
    <div className="ifc-viewer">
      {!buffer && !failed ? (
        <p className="ifc-viewer__empty">Select or upload an IFC model to view it here.</p>
      ) : null}
      {status ? <p className="ifc-viewer__status">{status}</p> : null}
      {failed ? <p className="ifc-viewer__error">{failed}</p> : null}
      <div ref={hostRef} className="ifc-viewer__canvas" aria-label="IFC 3D canvas" />
    </div>
  );
}
