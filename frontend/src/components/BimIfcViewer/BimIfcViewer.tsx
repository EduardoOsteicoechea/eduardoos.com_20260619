/**
 * Admin BIM IFC viewer (spec 037): That Open SimpleScene by default (original
 * 886ebc8 lighting) + optional ShadowedScene when Shadows are enabled; browser
 * IFC upload + host Python console; viewport Lights sidebar (ambient /
 * directional / sun elevation+azimuth / shadows). Upload / Python / Output /
 * Offload are icon-only header-dynamic-menu tools. Viewport is full-bleed;
 * That Open logo is disabled via showLogo = false.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
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

/** Live scene light + sun + shadow controls (spec 037). */
type LightSettings = {
  ambientIntensity: number;
  ambientColor: string;
  directionalIntensity: number;
  directionalColor: string;
  /** Degrees above horizon (Y-up). */
  sunElevation: number;
  /** Degrees from +Z toward +X. */
  sunAzimuth: number;
  shadowsEnabled: boolean;
  /** Shadow map edge length (That Open ShadowedScene resolution). */
  shadowMapSize: number;
  /** Shadow bias (typically 0 … -0.005). */
  shadowBias: number;
};

/**
 * Nominal SimpleScene._defaultConfig values for sidebar / Reset (documentation).
 * First paint does NOT post-apply these — original viewer was plain setup() only.
 */
const LEGACY_DIR = { x: 5, y: 10, z: 3 };
const SUN_DISTANCE = Math.hypot(LEGACY_DIR.x, LEGACY_DIR.y, LEGACY_DIR.z);

function sunDirectionFromAngles(elevationDeg: number, azimuthDeg: number, radius = SUN_DISTANCE) {
  const e = (elevationDeg * Math.PI) / 180;
  const a = (azimuthDeg * Math.PI) / 180;
  const cosE = Math.cos(e);
  return new THREE.Vector3(
    radius * cosE * Math.sin(a),
    radius * Math.sin(e),
    radius * cosE * Math.cos(a),
  );
}

function anglesFromDirection(x: number, y: number, z: number) {
  const r = Math.hypot(x, y, z) || 1;
  const elevation = (Math.asin(Math.min(1, Math.max(-1, y / r))) * 180) / Math.PI;
  const azimuth = (((Math.atan2(x, z) * 180) / Math.PI) + 360) % 360;
  return { elevation, azimuth };
}

function legacySunPosition() {
  return new THREE.Vector3(LEGACY_DIR.x, LEGACY_DIR.y, LEGACY_DIR.z);
}

const LEGACY_SUN = anglesFromDirection(LEGACY_DIR.x, LEGACY_DIR.y, LEGACY_DIR.z);

const DEFAULT_LIGHTS: LightSettings = {
  ambientIntensity: 1,
  ambientColor: "#ffffff",
  directionalIntensity: 1.5,
  directionalColor: "#ffffff",
  sunElevation: Number(LEGACY_SUN.elevation.toFixed(1)),
  sunAzimuth: Number(LEGACY_SUN.azimuth.toFixed(1)),
  shadowsEnabled: false,
  shadowMapSize: 2048,
  shadowBias: -0.002,
};

const SHADOW_MAP_SIZES = [512, 1024, 2048, 4096] as const;
const SHADOW_GROUND_NAME = "bim-ifc-shadow-ground";

const DEFAULT_CODE = `# Empty code runs hello_world.py on the server.
# BIM_IFC_ARGS JSON is injected for the browser-loaded IFC metadata.
print("custom run")
`;

type SceneLightsApi = {
  apply: (settings: LightSettings, opts?: { rebuildShadows?: boolean; resetOriginal?: boolean }) => void;
};

function enableMeshShadows(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!("isMesh" in mesh) || !mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const opaque = mats.every((m) => {
      if (!m) return true;
      const opacity = "opacity" in m ? Number((m as THREE.Material & { opacity?: number }).opacity ?? 1) : 1;
      return opacity >= 0.99;
    });
    if (opaque) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
}

/** Move non-light, non-ground children so models/grid survive scene-class swaps. */
function migrateSceneContents(from: THREE.Scene, to: THREE.Scene) {
  const movers: THREE.Object3D[] = [];
  for (const child of [...from.children]) {
    const asLight = child as THREE.Light;
    if ("isLight" in asLight && asLight.isLight) continue;
    if (child.name === SHADOW_GROUND_NAME) continue;
    movers.push(child);
  }
  for (const obj of movers) {
    to.add(obj);
  }
}

function sunDirForSettings(settings: LightSettings) {
  const atDefaultSun =
    settings.sunElevation === DEFAULT_LIGHTS.sunElevation &&
    settings.sunAzimuth === DEFAULT_LIGHTS.sunAzimuth;
  return atDefaultSun
    ? legacySunPosition()
    : sunDirectionFromAngles(settings.sunElevation, settings.sunAzimuth);
}

function applySimpleLightConfig(
  scene: { config: { ambientLight: { intensity: number; color: THREE.Color }; directionalLight: { intensity: number; color: THREE.Color; position: THREE.Vector3 } } },
  settings: LightSettings,
  dir: THREE.Vector3,
) {
  const cfg = scene.config;
  cfg.ambientLight.intensity = settings.ambientIntensity;
  cfg.ambientLight.color = new THREE.Color(settings.ambientColor);
  cfg.directionalLight.intensity = settings.directionalIntensity;
  cfg.directionalLight.color = new THREE.Color(settings.directionalColor);
  cfg.directionalLight.position = dir;
}

function LightIcon() {
  return (
    <svg className="bim-ifc-viewer__rail-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 4.5a1 1 0 0 1 1 1V7a1 1 0 1 1-2 0V5.5a1 1 0 0 1 1-1zm0 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm7.07-8.57a1 1 0 0 1 0 1.41l-1.06 1.06a1 1 0 1 1-1.41-1.41l1.06-1.06a1 1 0 0 1 1.41 0zM6.4 15.6a1 1 0 0 1 0 1.41l-1.06 1.06a1 1 0 1 1-1.41-1.41L5 15.6a1 1 0 0 1 1.4 0zM19.5 12a1 1 0 0 1-1 1H17a1 1 0 1 1 0-2h1.5a1 1 0 0 1 1 1zM7 12a1 1 0 0 1-1 1H4.5a1 1 0 1 1 0-2H6a1 1 0 0 1 1 1zm10.66 5.07a1 1 0 0 1-1.41 0l-1.06-1.06a1 1 0 0 1 1.41-1.41l1.06 1.06a1 1 0 0 1 0 1.41zM8.46 7.4A1 1 0 0 1 7.05 6L6 4.93A1 1 0 0 1 7.4 3.52L8.46 4.58a1 1 0 0 1 0 1.82zM12 16.5a1 1 0 0 1 1 1V19a1 1 0 1 1-2 0v-1.5a1 1 0 0 1 1-1z"
      />
    </svg>
  );
}

export default function BimIfcViewer() {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const disposeRef = useRef<null | (() => void)>(null);
  const loadIfcRef = useRef<null | ((file: File) => Promise<void>)>(null);
  const offloadIfcRef = useRef<null | (() => Promise<void>)>(null);
  const lightsApiRef = useRef<SceneLightsApi | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [status, setStatus] = useState("Initializing viewer…");
  const [ifc, setIfc] = useState<IfcMeta>({ name: "", sizeBytes: 0, loaded: false });
  const [uploadOpen, setUploadOpen] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [outputOpen, setOutputOpen] = useState(false);
  const [lightsOpen, setLightsOpen] = useState(false);
  const [lights, setLights] = useState<LightSettings>(DEFAULT_LIGHTS);
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

        type SimpleScene = InstanceType<typeof OBC.SimpleScene>;
        type ShadowedScene = InstanceType<typeof OBC.ShadowedScene>;
        type AnyScene = SimpleScene | ShadowedScene;

        const components = new OBC.Components();
        const worlds = components.get(OBC.Worlds);
        const world = worlds.create();

        // Original first-ship path (886ebc8): SimpleScene + plain setup(), no light overwrite.
        world.scene = new OBC.SimpleScene(components);
        world.scene.setup();
        world.scene.three.background = null;

        const renderer = new OBC.SimpleRenderer(components, host);
        renderer.showLogo = false;
        world.renderer = renderer;
        world.camera = new OBC.OrthoPerspectiveCamera(components);
        await world.camera.controls.setLookAt(12, 8, 12, 0, 0, 0);
        components.init();
        components.get(OBC.Grids).create(world);

        const isShadowed = (scene: AnyScene): scene is ShadowedScene =>
          scene instanceof OBC.ShadowedScene;

        const addShadowGround = (scene: ShadowedScene) => {
          const existing = scene.three.getObjectByName(SHADOW_GROUND_NAME);
          if (existing) return;
          const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(400, 400),
            new THREE.ShadowMaterial({ opacity: 0.32 }),
          );
          ground.name = SHADOW_GROUND_NAME;
          ground.rotation.x = -Math.PI / 2;
          ground.position.y = 0;
          ground.receiveShadow = true;
          ground.castShadow = false;
          scene.three.add(ground);
        };

        const disposePreviousScene = (prev: AnyScene) => {
          try {
            prev.dispose();
          } catch {
            /* ignore dispose races during swap */
          }
        };

        /** Restore original SimpleScene lighting (plain setup). Optionally re-apply user slider values. */
        const ensureSimpleScene = (settings: LightSettings | null) => {
          const prev = world.scene as AnyScene;
          if (!isShadowed(prev) && settings === null) {
            // Already SimpleScene and Reset wants untouched library setup.
            prev.setup();
            prev.three.background = null;
            renderer.three.shadowMap.enabled = false;
            return;
          }
          if (!isShadowed(prev) && settings) {
            applySimpleLightConfig(prev, settings, sunDirForSettings(settings));
            renderer.three.shadowMap.enabled = false;
            return;
          }

          const next = new OBC.SimpleScene(components);
          world.scene = next;
          next.setup();
          next.three.background = null;
          migrateSceneContents(prev.three, next.three);
          disposePreviousScene(prev);
          renderer.three.shadowMap.enabled = false;
          if (settings) {
            applySimpleLightConfig(next, settings, sunDirForSettings(settings));
          }
        };

        const ensureShadowedScene = (settings: LightSettings, rebuild: boolean) => {
          const dir = sunDirForSettings(settings);
          const prev = world.scene as AnyScene;

          if (!isShadowed(prev)) {
            const next = new OBC.ShadowedScene(components);
            // World setter assigns currentWorld before setup (required by ShadowedScene).
            world.scene = next;
            next.setup({
              ambientLight: {
                color: new THREE.Color(settings.ambientColor),
                intensity: settings.ambientIntensity,
              },
              directionalLight: {
                color: new THREE.Color(settings.directionalColor),
                intensity: settings.directionalIntensity,
                position: dir.clone(),
              },
              shadows: { cascade: 1, resolution: settings.shadowMapSize },
              cascade: 1,
              resolution: settings.shadowMapSize,
            } as Parameters<ShadowedScene["setup"]>[0]);
            next.three.background = null;
            next.autoBias = false;
            next.bias = settings.shadowBias;
            next.shadowsEnabled = true;
            addShadowGround(next);
            migrateSceneContents(prev.three, next.three);
            disposePreviousScene(prev);
            renderer.three.shadowMap.enabled = true;
            renderer.three.shadowMap.type = THREE.VSMShadowMap;
            applySimpleLightConfig(next, settings, dir);
            void next.updateShadows();
            return;
          }

          if (rebuild) {
            prev.setup({
              ambientLight: {
                color: new THREE.Color(settings.ambientColor),
                intensity: settings.ambientIntensity,
              },
              directionalLight: {
                color: new THREE.Color(settings.directionalColor),
                intensity: settings.directionalIntensity,
                position: dir.clone(),
              },
              shadows: { cascade: 1, resolution: settings.shadowMapSize },
              cascade: 1,
              resolution: settings.shadowMapSize,
            } as Parameters<ShadowedScene["setup"]>[0]);
            prev.three.background = null;
            addShadowGround(prev);
          }

          prev.autoBias = false;
          prev.bias = settings.shadowBias;
          prev.shadowsEnabled = true;
          applySimpleLightConfig(prev, settings, dir);
          renderer.three.shadowMap.enabled = true;
          renderer.three.shadowMap.type = THREE.VSMShadowMap;
          void prev.updateShadows();
        };

        world.camera.controls.addEventListener("rest", () => {
          const scene = world.scene as AnyScene;
          if (isShadowed(scene) && scene.shadowsEnabled) void scene.updateShadows();
        });

        lightsApiRef.current = {
          apply: (settings, opts) => {
            if (opts?.resetOriginal) {
              ensureSimpleScene(null);
              return;
            }
            if (settings.shadowsEnabled) {
              ensureShadowedScene(settings, Boolean(opts?.rebuildShadows));
            } else {
              // Shadows off → SimpleScene. Re-apply slider state so sun/intensity stay live.
              ensureSimpleScene(settings);
            }
          },
        };
        // Do not apply(DEFAULT_LIGHTS) after first setup — that was not the original path.

        const ifcLoader = components.get(OBC.IfcLoader);
        await ifcLoader.setup({
          autoSetWasm: false,
          wasm: {
            path: "https://unpkg.com/web-ifc@0.0.77/",
            absolute: true,
          },
        });

        // Keep IFC world origin at scene origin (no first-vertex coordinate shift).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const webIfcSettings = (ifcLoader as any).settings ?? (ifcLoader as any).webIfc;
        if (webIfcSettings && typeof webIfcSettings === "object") {
          webIfcSettings.COORDINATE_TO_ORIGIN = false;
        }

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
          enableMeshShadows(model.object);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          model.tiles?.onItemSet?.add(({ value: mesh }: { value: any }) => {
            if (mesh && "isMesh" in mesh && mesh.isMesh) {
              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              const opacity = mats[0] && "opacity" in mats[0] ? Number(mats[0].opacity ?? 1) : 1;
              if (opacity >= 0.99) {
                mesh.castShadow = true;
                mesh.receiveShadow = true;
              }
            }
          });
          void fragments.core.update(true);
          const scene = world.scene as AnyScene;
          if (isShadowed(scene) && scene.shadowsEnabled) void scene.updateShadows();
        });

        loadIfcRef.current = async (file: File) => {
          const existingIds = [...fragments.list.keys()];
          for (const modelId of existingIds) {
            await fragments.core.disposeModel(modelId);
          }
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
          const scene = world.scene as AnyScene;
          if (isShadowed(scene) && scene.shadowsEnabled) void scene.updateShadows();
        };

        offloadIfcRef.current = async () => {
          const modelIds = [...fragments.list.keys()];
          for (const modelId of modelIds) {
            await fragments.core.disposeModel(modelId);
          }
          void fragments.core.update(true);
          const scene = world.scene as AnyScene;
          if (isShadowed(scene) && scene.shadowsEnabled) void scene.updateShadows();
        };

        disposeRef.current = () => {
          lightsApiRef.current = null;
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
      offloadIfcRef.current = null;
      lightsApiRef.current = null;
    };
  }, [allowed]);

  const patchLights = useCallback((patch: Partial<LightSettings>, rebuildShadows = false) => {
    setLights((prev) => {
      const next = { ...prev, ...patch };
      lightsApiRef.current?.apply(next, { rebuildShadows });
      return next;
    });
  }, []);

  const onFile = useCallback(async (file: File | null) => {
    if (!file || !loadIfcRef.current) return;
    try {
      await loadIfcRef.current(file);
      setUploadOpen(false);
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
        setOutputOpen(true);
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
      setStatus(
        data.ok
          ? `Python ok (exit ${data.exitCode}) — open Output for details.`
          : `Python failed (exit ${data.exitCode}) — open Output for details.`,
      );
      setOutputOpen(true);
    } catch (err) {
      setOutput(err instanceof Error ? err.message : String(err));
      setOutputOpen(true);
    } finally {
      setRunning(false);
    }
  }, [code, ifc]);

  const openUpload = useCallback(() => {
    setConsoleOpen(false);
    setOutputOpen(false);
    setUploadOpen((v) => !v);
  }, []);

  const openConsole = useCallback(() => {
    setUploadOpen(false);
    setOutputOpen(false);
    setConsoleOpen((v) => !v);
  }, []);

  const openOutput = useCallback(() => {
    setUploadOpen(false);
    setConsoleOpen(false);
    setOutputOpen((v) => !v);
  }, []);

  const offloadModel = useCallback(async () => {
    if (!ifc.loaded || !offloadIfcRef.current) return;
    try {
      setStatus("Offloading model…");
      await offloadIfcRef.current();
      setIfc({ name: "", sizeBytes: 0, loaded: false });
      if (fileInputRef.current) fileInputRef.current.value = "";
      setStatus("Model offloaded. Upload an IFC file to load a new model.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Offload failed: ${msg}`);
    }
  }, [ifc.loaded]);

  if (allowed === null) {
    return <p className="bim-ifc-viewer__gate">Checking admin access…</p>;
  }
  if (!allowed) {
    return <p className="bim-ifc-viewer__gate">Admin only.</p>;
  }

  return (
    <div className="bim-ifc-viewer">
      <BimIfcHeaderMenu
        uploadOpen={uploadOpen}
        consoleOpen={consoleOpen}
        outputOpen={outputOpen}
        modelLoaded={ifc.loaded}
        onToggleUpload={openUpload}
        onToggleConsole={openConsole}
        onToggleOutput={openOutput}
        onOffloadModel={() => void offloadModel()}
      />

      <div className={`bim-ifc-viewer__stage${lightsOpen ? " bim-ifc-viewer__stage--lights-open" : ""}`}>
        <p className="bim-ifc-viewer__status" role="status">
          {status}
          {ifc.loaded ? ` · IFC: ${ifc.name}` : ""}
          {output && !outputOpen ? " · Output available in header" : ""}
        </p>

        <div className="bim-ifc-viewer__rail" role="toolbar" aria-label="Viewport tools">
          <button
            type="button"
            className={`bim-ifc-viewer__rail-btn${lightsOpen ? " is-active" : ""}`}
            title="Scene lights"
            aria-label="Scene lights"
            aria-pressed={lightsOpen}
            aria-controls="bim-ifc-lights-panel"
            onClick={() => setLightsOpen((v) => !v)}
          >
            <LightIcon />
          </button>
        </div>

        <aside
          id="bim-ifc-lights-panel"
          className="bim-ifc-viewer__lights"
          aria-label="Scene light settings"
          hidden={!lightsOpen}
        >
          <header className="bim-ifc-viewer__lights-head">
            <h2>Lights</h2>
            <button
              type="button"
              className="bim-ifc-viewer__close"
              onClick={() => setLightsOpen(false)}
            >
              Close
            </button>
          </header>

          <fieldset className="bim-ifc-viewer__lights-group">
            <legend>Ambient</legend>
            <label className="bim-ifc-viewer__field">
              <span>Intensity</span>
              <input
                type="range"
                min={0}
                max={5}
                step={0.05}
                value={lights.ambientIntensity}
                onChange={(e) => patchLights({ ambientIntensity: Number(e.target.value) })}
              />
              <span className="bim-ifc-viewer__field-val">{lights.ambientIntensity.toFixed(2)}</span>
            </label>
            <label className="bim-ifc-viewer__field">
              <span>Color</span>
              <input
                type="color"
                value={lights.ambientColor}
                onChange={(e) => patchLights({ ambientColor: e.target.value })}
              />
            </label>
          </fieldset>

          <fieldset className="bim-ifc-viewer__lights-group">
            <legend>Directional</legend>
            <label className="bim-ifc-viewer__field">
              <span>Intensity</span>
              <input
                type="range"
                min={0}
                max={5}
                step={0.05}
                value={lights.directionalIntensity}
                onChange={(e) => patchLights({ directionalIntensity: Number(e.target.value) })}
              />
              <span className="bim-ifc-viewer__field-val">{lights.directionalIntensity.toFixed(2)}</span>
            </label>
            <label className="bim-ifc-viewer__field">
              <span>Color</span>
              <input
                type="color"
                value={lights.directionalColor}
                onChange={(e) => patchLights({ directionalColor: e.target.value })}
              />
            </label>
          </fieldset>

          <fieldset className="bim-ifc-viewer__lights-group">
            <legend>Sun</legend>
            <label className="bim-ifc-viewer__field">
              <span>Elevation</span>
              <input
                type="range"
                min={1}
                max={89}
                step={0.5}
                value={lights.sunElevation}
                onChange={(e) => patchLights({ sunElevation: Number(e.target.value) })}
              />
              <span className="bim-ifc-viewer__field-val">{lights.sunElevation.toFixed(1)}°</span>
            </label>
            <label className="bim-ifc-viewer__field">
              <span>Azimuth</span>
              <input
                type="range"
                min={0}
                max={360}
                step={1}
                value={lights.sunAzimuth}
                onChange={(e) => patchLights({ sunAzimuth: Number(e.target.value) })}
              />
              <span className="bim-ifc-viewer__field-val">{lights.sunAzimuth.toFixed(0)}°</span>
            </label>
          </fieldset>

          <fieldset className="bim-ifc-viewer__lights-group">
            <legend>Shadows</legend>
            <label className="bim-ifc-viewer__field bim-ifc-viewer__field--check">
              <span>Enabled</span>
              <input
                type="checkbox"
                checked={lights.shadowsEnabled}
                onChange={(e) => patchLights({ shadowsEnabled: e.target.checked })}
              />
              <span className="bim-ifc-viewer__field-val">{lights.shadowsEnabled ? "on" : "off"}</span>
            </label>
            <label className="bim-ifc-viewer__field">
              <span>Map size</span>
              <select
                className="bim-ifc-viewer__select"
                value={lights.shadowMapSize}
                onChange={(e) => patchLights({ shadowMapSize: Number(e.target.value) }, true)}
              >
                {SHADOW_MAP_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              <span className="bim-ifc-viewer__field-val">{lights.shadowMapSize}</span>
            </label>
            <label className="bim-ifc-viewer__field">
              <span>Bias</span>
              <input
                type="range"
                min={-0.01}
                max={0}
                step={0.0001}
                value={lights.shadowBias}
                onChange={(e) => patchLights({ shadowBias: Number(e.target.value) })}
              />
              <span className="bim-ifc-viewer__field-val">{lights.shadowBias.toFixed(4)}</span>
            </label>
          </fieldset>

          <button
            type="button"
            className="btn bim-ifc-viewer__lights-reset"
            onClick={() => {
              setLights(DEFAULT_LIGHTS);
              lightsApiRef.current?.apply(DEFAULT_LIGHTS, { resetOriginal: true });
            }}
          >
            Reset lights
          </button>
        </aside>

        <div ref={canvasHostRef} className="bim-ifc-viewer__canvas" aria-label="IFC 3D viewport" />
      </div>

      {uploadOpen ? (
        <div className="bim-ifc-viewer__modal" role="dialog" aria-modal="true" aria-label="Upload IFC">
          <div className="bim-ifc-viewer__modal-panel bim-ifc-viewer__modal-panel--narrow">
            <header className="bim-ifc-viewer__modal-head">
              <h2>Upload IFC</h2>
              <button type="button" className="bim-ifc-viewer__close" onClick={() => setUploadOpen(false)}>
                Close
              </button>
            </header>
            <p className="bim-ifc-viewer__hint">
              File stays in the browser only — nothing is uploaded to the server. Choose an{" "}
              <code>.ifc</code> model to load into the viewport.
            </p>
            <p className="bim-ifc-viewer__meta">
              Current: {ifc.loaded ? `${ifc.name} (${ifc.sizeBytes} bytes)` : "none loaded"}
            </p>
            <label className="bim-ifc-viewer__upload bim-ifc-viewer__upload--modal">
              <span>Choose IFC file</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".ifc,application/x-step,application/octet-stream"
                onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        </div>
      ) : null}

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

      {outputOpen ? (
        <div className="bim-ifc-viewer__modal" role="dialog" aria-modal="true" aria-label="Python output">
          <div className="bim-ifc-viewer__modal-panel">
            <header className="bim-ifc-viewer__modal-head">
              <h2>Python output</h2>
              <button type="button" className="bim-ifc-viewer__close" onClick={() => setOutputOpen(false)}>
                Close
              </button>
            </header>
            <pre className="bim-ifc-viewer__pre bim-ifc-viewer__pre--modal">
              {output || "Run the Python console to see stdout/stderr here."}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}
