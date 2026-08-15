import { useEffect, useRef, useState } from "react";
import "./IfcViewer.css";

type IfcViewerProps = {
  buffer: Uint8Array | null;
  modelName: string;
};

/**
 * That Open Company + Three.js IFC viewer.
 * Initializes Fragments, converts IFC with IfcLoader, and mounts the model in a world.
 */
export default function IfcViewer({ buffer, modelName }: IfcViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState("");

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !buffer) {
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
        world.scene.three.background = new THREE.Color(0x000000);

        world.renderer = new OBC.SimpleRenderer(comps, host);
        world.camera = new OBC.OrthoPerspectiveCamera(comps);
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
        });

        const ifcLoader = comps.get(OBC.IfcLoader);
        await ifcLoader.setup({
          autoSetWasm: false,
          wasm: {
            path: "https://unpkg.com/web-ifc@0.0.77/",
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
      {!buffer && !failed && (
        <p className="ifc-viewer__empty">Select or upload an IFC model to view it here.</p>
      )}
      {status && <p className="ifc-viewer__status">{status}</p>}
      {failed && <p className="ifc-viewer__error">{failed}</p>}
      <div ref={hostRef} className="ifc-viewer__canvas" />
    </div>
  );
}
