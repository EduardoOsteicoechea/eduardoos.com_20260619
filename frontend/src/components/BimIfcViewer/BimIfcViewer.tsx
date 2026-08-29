/**
 * Admin BIM IFC viewer (spec 037): That Open scene + browser IFC upload +
 * host Python console posting IFC metadata args.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { APP_ROUTES, BIM_ROUTES } from "../../config/routes";
import { getAuthToken, isPlatformAdmin } from "../../lib/auth";
import BimIfcHeaderMenu from "./BimIfcHeaderMenu";
import "./BimIfcViewer.css";

type IfcMeta = {
  name: string;
  sizeBytes: number;
  loaded: boolean;
};

type RunResponse = {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut?: boolean;
  runtime?: string;
};

const DEFAULT_CODE = `# Empty code runs hello_world.py on the server.
# BIM_IFC_ARGS JSON is injected for the browser-loaded IFC metadata.
print("custom run")
`;

export default function BimIfcViewer() {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const disposeRef = useRef<null | (() => void)>(null);
  const loadIfcRef = useRef<null | ((file: File) => Promise<void>)>(null);

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [status, setStatus] = useState("Initializing viewer…");
  const [ifc, setIfc] = useState<IfcMeta>({ name: "", sizeBytes: 0, loaded: false });
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [code, setCode] = useState("");
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!isPlatformAdmin()) {
      setAllowed(false);
      window.location.replace(`${APP_ROUTES.login}?next=${encodeURIComponent(APP_ROUTES.bimIfcViewer)}`);
      return;
    }
    setAllowed(true);
  }, []);

  useEffect(() => {
    if (!allowed) return;
    const host = canvasHostRef.current;
    if (!host) return;
    let cancelled = false;

    (async () => {
      try {
        const OBC = await import("@thatopen/components");
        if (cancelled) return;

        const components = new OBC.Components();
        const worlds = components.get(OBC.Worlds);
        const world = worlds.create();

        world.scene = new OBC.SimpleScene(components);
        world.scene.setup();
        world.scene.three.background = null;

        world.renderer = new OBC.SimpleRenderer(components, host);
        world.camera = new OBC.OrthoPerspectiveCamera(components);
        await world.camera.controls.setLookAt(12, 8, 12, 0, 0, 0);
        components.init();
        components.get(OBC.Grids).create(world);

        const ifcLoader = components.get(OBC.IfcLoader);
        await ifcLoader.setup({
          autoSetWasm: false,
          wasm: {
            path: "https://unpkg.com/web-ifc@0.0.77/",
            absolute: true,
          },
        });

        const workerUrl = await OBC.FragmentsManager.getWorker();
        const fragments = components.get(OBC.FragmentsManager);
        fragments.init(workerUrl);
        world.camera.controls.addEventListener("update", () => {
          void fragments.core.update();
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fragments.list.onItemSet.add(({ value: model }: { value: any }) => {
          model.useCamera(world.camera.three);
          world.scene.three.add(model.object);
          void fragments.core.update(true);
        });

        loadIfcRef.current = async (file: File) => {
          setStatus(`Converting ${file.name}…`);
          const data = new Uint8Array(await file.arrayBuffer());
          await ifcLoader.load(data, false, file.name.replace(/\.[^.]+$/, "") || "model", {
            processData: {
              progressCallback: (progress: number) => {
                setStatus(`Converting ${file.name}… ${Math.round(progress * 100)}%`);
              },
            },
          });
          setIfc({ name: file.name, sizeBytes: file.size, loaded: true });
          setStatus(`Loaded ${file.name}`);
        };

        disposeRef.current = () => {
          try {
            components.dispose();
          } catch {
            /* ignore dispose races */
          }
        };
        setStatus("Upload an IFC file to load the model.");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setStatus(`Viewer failed: ${msg}`);
      }
    })();

    return () => {
      cancelled = true;
      disposeRef.current?.();
      disposeRef.current = null;
      loadIfcRef.current = null;
    };
  }, [allowed]);

  const onFile = useCallback(async (file: File | null) => {
    if (!file || !loadIfcRef.current) return;
    try {
      await loadIfcRef.current(file);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Load failed: ${msg}`);
      setIfc({ name: file.name, sizeBytes: file.size, loaded: false });
    }
  }, []);

  const runPython = useCallback(async () => {
    setRunning(true);
    setOutput("Running…");
    try {
      const token = getAuthToken().trim();
      const res = await fetch(BIM_ROUTES.pythonRun, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: code.trim() ? code : "",
          ifc,
        }),
      });
      const data = (await res.json()) as RunResponse & { error?: string; message?: string };
      if (!res.ok) {
        setOutput(data.error || data.message || `HTTP ${res.status}`);
        return;
      }
      const parts = [
        data.ok ? "ok" : "failed",
        `exit=${data.exitCode}`,
        data.timedOut ? "timedOut" : "",
        data.runtime ? `runtime=${data.runtime}` : "",
        "",
        "--- stdout ---",
        data.stdout || "(empty)",
        "",
        "--- stderr ---",
        data.stderr || "(empty)",
      ].filter(Boolean);
      setOutput(parts.join("\n"));
    } catch (err) {
      setOutput(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }, [code, ifc]);

  if (allowed === null) {
    return <p className="bim-ifc-viewer__gate">Checking admin access…</p>;
  }
  if (!allowed) {
    return <p className="bim-ifc-viewer__gate">Admin only.</p>;
  }

  return (
    <div className="bim-ifc-viewer">
      <BimIfcHeaderMenu
        consoleOpen={consoleOpen}
        onToggleConsole={() => setConsoleOpen((v) => !v)}
      />

      <header className="bim-ifc-viewer__toolbar">
        <label className="bim-ifc-viewer__upload">
          <span>Upload IFC</span>
          <input
            type="file"
            accept=".ifc,application/x-step,application/octet-stream"
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <p className="bim-ifc-viewer__status" role="status">
          {status}
        </p>
      </header>

      <div ref={canvasHostRef} className="bim-ifc-viewer__canvas" aria-label="IFC 3D viewport" />

      <section className="bim-ifc-viewer__output" aria-label="Python output">
        <h2 className="bim-ifc-viewer__output-title">Python output</h2>
        <pre className="bim-ifc-viewer__pre">{output || "Run the Python console to see stdout/stderr here."}</pre>
      </section>

      {consoleOpen ? (
        <div className="bim-ifc-viewer__modal" role="dialog" aria-modal="true" aria-label="Python console">
          <div className="bim-ifc-viewer__modal-panel">
            <header className="bim-ifc-viewer__modal-head">
              <h2>Python console</h2>
              <button type="button" className="bim-ifc-viewer__close" onClick={() => setConsoleOpen(false)}>
                Close
              </button>
            </header>
            <p className="bim-ifc-viewer__hint">
              Runs on the host under <code>backend/bim/bim_runtime</code>. Empty code →{" "}
              <code>hello_world.py</code>. IFC file stays in the browser; metadata is posted as{" "}
              <code>BIM_IFC_ARGS</code>.
            </p>
            <p className="bim-ifc-viewer__meta">
              IFC: {ifc.loaded ? `${ifc.name} (${ifc.sizeBytes} bytes)` : "none loaded"}
            </p>
            <textarea
              className="bim-ifc-viewer__code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              placeholder={DEFAULT_CODE}
              rows={12}
            />
            <div className="bim-ifc-viewer__modal-actions">
              <button type="button" className="btn btn--primary" disabled={running} onClick={() => void runPython()}>
                {running ? "Running…" : "Run"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
