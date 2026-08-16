/**
 * That Open Company + Three.js IFC viewer island.
 * Initializes Fragments, converts IFC with IfcLoader, mounts the model in a world,
 * and fits the camera once the fragment list receives the loaded model.
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

    void (async () => {
      setFailed("");
      setStatus("Starting That Open viewer…");
      try {
        const THREE = await import("three");
        const OBC = await import("@thatopen/components");
        if (disposed) return;

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

        const fragments = comps.get(OBC.FragmentsManager);
        fragments.init(await OBC.FragmentsManager.getWorker());
        fragments.list.onItemSet.add(({ value: model }) => {
          const cam = world.camera.three;
          if ("useCamera" in model && typeof model.useCamera === "function") {
            model.useCamera(cam);
          }
          if ("object" in model && model.object) {
            world.scene.three.add(model.object as never);
          }
          void fragments.core.update(true);
          // Fit orbit camera to the loaded fragment geometry.
          void world.camera.fitToItems().catch(() => {
            /* fit is best-effort if bounds are empty */
          });
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
        await ifcLoader.load(buffer, true, modelName || "model");
        if (disposed) return;
        setStatus("");
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
      <div ref={hostRef} className="ifc-viewer__canvas" />
    </div>
  );
}
