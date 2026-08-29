/**
 * BIM IFC viewer (spec 037): public That Open scene, shared ifcbim/library/
 * browse, admin S3 upload + Python console, header Lights with locked preset.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { BIM_ROUTES } from "../../config/routes";
import { getAuthToken, isPlatformAdmin } from "../../lib/auth";
import { resolveTheme } from "../../lib/theme";
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

/** User-locked light preset (live panel 2026-08-29) — Reset restores this. */
const DEFAULT_LIGHTS: LightSettings = {
  ambientIntensity: 2.85,
  ambientColor: "#ffffff",
  directionalIntensity: 4.05,
  directionalColor: "#ffffff",
  sunElevation: 16,
  sunAzimuth: 42,
  shadowsEnabled: true,
  shadowMapSize: 2048,
  shadowBias: -0.002,
};

const SHADOW_MAP_SIZES = [512, 1024, 2048, 4096] as const;
const SHADOW_GROUND_NAME = "bim-ifc-shadow-ground";
/** Soft bone (light) / cool grey-blue (dark) — spec 037, follows site theme. */
const VIEWPORT_BG_LIGHT = "#e8e0d4";
const VIEWPORT_BG_DARK = "#141820";

function viewportBgForTheme(): string {
  if (typeof document === "undefined") return VIEWPORT_BG_LIGHT;
  const html = document.documentElement;
  const attr = html.getAttribute("data-theme");
  if (attr === "dark" || html.classList.contains("dark")) return VIEWPORT_BG_DARK;
  if (attr === "light") return VIEWPORT_BG_LIGHT;
  // Bootstrap may not have set data-theme yet — match resolveTheme.
  return resolveTheme() === "dark" ? VIEWPORT_BG_DARK : VIEWPORT_BG_LIGHT;
}

function applyViewportBackground(scene: THREE.Scene) {
  scene.background = new THREE.Color(viewportBgForTheme());
}

const DEFAULT_CODE = `# Empty code runs hello_world.py on the server.
# BIM_IFC_ARGS JSON is injected for the browser-loaded IFC metadata.
print("custom run")
`;

type SceneLightsApi = {
  apply: (settings: LightSettings, opts?: { rebuildShadows?: boolean; resetOriginal?: boolean }) => void;
};

function isOpaqueMesh(mesh: THREE.Mesh) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return mats.every((m) => {
    if (!m) return true;
    const opacity = "opacity" in m ? Number((m as THREE.Material & { opacity?: number }).opacity ?? 1) : 1;
    return opacity >= 0.99;
  });
}

/**
 * Opaque fragment meshes cast + receive (That Open ShadowedScene / Fragments samples).
 * Also marks materials needsUpdate so shaders recompile with USE_SHADOWMAP after a
 * SimpleScene→ShadowedScene switch (model often first drew with shadowMap off).
 */
function enableMeshShadows(root: THREE.Object3D) {
  root.traverse((obj) => {
    enableTileShadows(obj);
  });
}

function enableTileShadows(mesh: THREE.Object3D) {
  if (!("isMesh" in mesh) || !(mesh as THREE.Mesh).isMesh) return;
  const m = mesh as THREE.Mesh;
  if (!isOpaqueMesh(m)) {
    m.castShadow = false;
    m.receiveShadow = false;
    return;
  }
  m.castShadow = true;
  m.receiveShadow = true;
  const mats = Array.isArray(m.material) ? m.material : [m.material];
  for (const mat of mats) {
    if (mat && "needsUpdate" in mat) mat.needsUpdate = true;
  }
}

/**
 * Reduce coplanar z-fighting on fragment materials (That Open sample recipe).
 * Helps terrain / street / sidewalk shadow receivers read cleanly.
 */
function softenFragmentMaterialZFight(material: THREE.Material) {
  if ("isLodMaterial" in material && (material as { isLodMaterial?: boolean }).isLodMaterial) return;
  material.polygonOffset = true;
  material.polygonOffsetUnits = 1;
  material.polygonOffsetFactor = Math.random();
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
  return sunDirectionFromAngles(settings.sunElevation, settings.sunAzimuth);
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

/**
 * ShadowedScene light apply: intensity/color via config setters (safe).
 * Sun direction must update the config value used by recomputeShadows WITHOUT
 * copying onto cascade lights — DirectionalLightConfig.position stomps CSM
 * positions and, combined with That Open's in-flight updateShadows lock, can
 * leave shadows broken after rapid sun slider moves.
 */
function applyShadowedLightConfig(
  scene: {
    config: {
      ambientLight: { intensity: number; color: THREE.Color };
      directionalLight: { intensity: number; color: THREE.Color; position: THREE.Vector3 };
    };
  },
  settings: LightSettings,
  dir: THREE.Vector3,
) {
  const cfg = scene.config;
  cfg.ambientLight.intensity = settings.ambientIntensity;
  cfg.ambientLight.color = new THREE.Color(settings.ambientColor);
  cfg.directionalLight.intensity = settings.directionalIntensity;
  cfg.directionalLight.color = new THREE.Color(settings.directionalColor);
  setShadowSunDirectionConfigOnly(cfg, dir);
}

function setShadowSunDirectionConfigOnly(
  cfg: { directionalLight: { position: THREE.Vector3 } },
  dir: THREE.Vector3,
) {
  const bag = (
    cfg as unknown as {
      _config?: { directionalLight?: { position?: { value?: THREE.Vector3 } } };
    }
  )._config;
  const stored = bag?.directionalLight?.position?.value;
  if (stored && typeof stored.copy === "function") {
    stored.copy(dir);
    return;
  }
  // Fallback: may stomp cascade light positions until requestShadowUpdate runs.
  cfg.directionalLight.position = dir;
}

/** Kick That Open CSM refresh; clear stuck locks so slider bursts still refresh. */
function requestShadowUpdate(scene: {
  updateShadows: () => Promise<void>;
  shadowsEnabled: boolean;
  distanceRenderer?: { _isWorkerBusy?: boolean };
}) {
  if (!scene.shadowsEnabled) return;
  const lock = scene as unknown as { _isComputingShadows?: boolean };
  lock._isComputingShadows = false;
  // DistanceRenderer.compute() can early-return while busy and leave CSM stale.
  const dr = scene.distanceRenderer;
  if (dr) dr._isWorkerBusy = false;
  void scene.updateShadows();
}

/**
 * Spec 037: after IFC load / first paint, CSM often needs a short delay while
 * fragments finish streaming. Refresh now + ~100ms + ~500ms so the limestone
 * floor and slab shading settle without the user having to orbit first.
 */
function scheduleShadowRefresh(run: () => void) {
  run();
  window.setTimeout(run, 100);
  window.setTimeout(run, 500);
}

/** Keep DistanceRenderer depth uniforms aligned with the live camera (near/far). */
function syncDistanceRendererCamera(
  scene: {
    distanceRenderer?: {
      depthMaterial?: { uniforms?: { cameraNear?: { value: number }; cameraFar?: { value: number } } };
    };
  },
  camera: THREE.Camera,
) {
  const uniforms = scene.distanceRenderer?.depthMaterial?.uniforms;
  if (!uniforms) return;
  if ("near" in camera && typeof (camera as THREE.PerspectiveCamera).near === "number") {
    if (uniforms.cameraNear) uniforms.cameraNear.value = (camera as THREE.PerspectiveCamera).near;
  }
  if ("far" in camera && typeof (camera as THREE.PerspectiveCamera).far === "number") {
    if (uniforms.cameraFar) uniforms.cameraFar.value = (camera as THREE.PerspectiveCamera).far;
  }
}

type LibraryModel = {
  key: string;
  name: string;
  sizeBytes: number;
  sizeHuman: string;
  lastModified: string;
  url: string;
};

type LoadIfcInput = { name: string; sizeBytes: number; data: Uint8Array };

function sortLibrary(models: LibraryModel[]) {
  return [...models].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

function formatLibraryDate(iso: string): string {
  const trimmed = iso.trim();
  if (!trimmed) return "";
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return trimmed;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const LIBRARY_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,119}$/;

function normalizeLibraryNameInput(raw: string): string {
  return raw
    .trim()
    .replace(/\.[Ii][Ff][Cc]$/, "")
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "");
}

export default function BimIfcViewer() {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const disposeRef = useRef<null | (() => void)>(null);
  const loadIfcRef = useRef<null | ((input: LoadIfcInput) => Promise<void>)>(null);
  const offloadIfcRef = useRef<null | (() => Promise<void>)>(null);
  const lightsApiRef = useRef<SceneLightsApi | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [ready, setReady] = useState(false);
  const [viewerReady, setViewerReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [status, setStatus] = useState("Initializing viewer…");
  const [ifc, setIfc] = useState<IfcMeta>({ name: "", sizeBytes: 0, loaded: false });
  const [uploadOpen, setUploadOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [outputOpen, setOutputOpen] = useState(false);
  const [lightsOpen, setLightsOpen] = useState(false);
  const [lights, setLights] = useState<LightSettings>(DEFAULT_LIGHTS);
  const [code, setCode] = useState("");
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [library, setLibrary] = useState<LibraryModel[]>([]);
  const [libraryStatus, setLibraryStatus] = useState("");
  const [libraryLoading, setLibraryLoading] = useState(false);

  useEffect(() => {
    setIsAdmin(isPlatformAdmin());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
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
        applyViewportBackground(world.scene.three);

        const syncViewportBackground = () => {
          const scene = world.scene as AnyScene | undefined;
          if (scene?.three) applyViewportBackground(scene.three);
        };
        const themeObserver = new MutationObserver(syncViewportBackground);
        themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["data-theme", "class"],
        });

        const renderer = new OBC.SimpleRenderer(components, host);
        renderer.showLogo = false;
        world.renderer = renderer;
        world.camera = new OBC.OrthoPerspectiveCamera(components);
        await world.camera.controls.setLookAt(12, 8, 12, 0, 0, 0);
        components.init();
        // Keep grid handle for CSM distanceRenderer exclusion, but hide the helper lines.
        const grid = components.get(OBC.Grids).create(world);
        grid.three.visible = false;

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
        // Fragments LOD/culling on camera move — not updateShadows (too hot).
        world.camera.controls.addEventListener("update", () => {
          void fragments.core.update();
        });

        // Soften z-fighting on fragment materials (That Open sample).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fragments.core.models.materials.list.onItemSet.add(({ value: material }: { value: any }) => {
          if (material && typeof material === "object") softenFragmentMaterialZFight(material);
        });

        const isShadowed = (scene: AnyScene): scene is ShadowedScene =>
          scene instanceof OBC.ShadowedScene;

        const addShadowGround = (scene: ShadowedScene) => {
          const catcherMat = () => new THREE.ShadowMaterial({ opacity: 0.28 });
          const existing = scene.three.getObjectByName(SHADOW_GROUND_NAME);
          if (existing) {
            // Always keep ground out of CSM distance (huge plane would blow the frustum).
            scene.distanceRenderer.excludedObjects.add(existing);
            const mesh = existing as THREE.Mesh;
            // Downgrade the brief opaque limestone plane — it dwarfed the model.
            const mat = mesh.material as THREE.Material | THREE.Material[];
            const single = Array.isArray(mat) ? mat[0] : mat;
            if (single && !("isShadowMaterial" in single && (single as THREE.ShadowMaterial).isShadowMaterial)) {
              if (Array.isArray(mat)) {
                for (const m of mat) m.dispose();
              } else {
                mat.dispose();
              }
              mesh.material = catcherMat();
            }
            mesh.receiveShadow = true;
            mesh.castShadow = false;
            return mesh;
          }
          // Invisible catcher: soft contact shadows only — no opaque “default plane”.
          const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), catcherMat());
          ground.name = SHADOW_GROUND_NAME;
          ground.rotation.x = -Math.PI / 2;
          ground.position.y = -0.02;
          ground.receiveShadow = true;
          ground.castShadow = false;
          ground.frustumCulled = false;
          scene.three.add(ground);
          scene.distanceRenderer.excludedObjects.add(ground);
          return ground;
        };

        /** That Open recipe: grid must not drive farthest-distance for CSM. */
        const excludeNonModelFromDistance = (scene: ShadowedScene) => {
          scene.distanceRenderer.excludedObjects.add(grid.three);
          const ground = scene.three.getObjectByName(SHADOW_GROUND_NAME);
          if (ground) scene.distanceRenderer.excludedObjects.add(ground);
        };

        const disposePreviousScene = (prev: AnyScene) => {
          try {
            prev.dispose();
          } catch {
            /* ignore dispose races during swap */
          }
        };

        /** Re-apply cast/receive on every loaded fragment model (after ShadowedScene swap). */
        const applyFragmentShadowFlags = () => {
          for (const [, model] of fragments.list) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const frag = model as any;
            const obj = frag?.object as THREE.Object3D | undefined;
            if (obj) enableMeshShadows(obj);
            // Tile map may hold meshes even before they hang under object.children.
            if (frag?.tiles && typeof frag.tiles[Symbol.iterator] === "function") {
              for (const [, mesh] of frag.tiles) {
                if (mesh) enableTileShadows(mesh);
              }
            }
          }
        };

        /** Restore original SimpleScene lighting (plain setup). Optionally re-apply user slider values. */
        const ensureSimpleScene = (settings: LightSettings | null) => {
          const prev = world.scene as AnyScene;
          if (!isShadowed(prev) && settings === null) {
            // Already SimpleScene and Reset wants untouched library setup.
            prev.setup();
            applyViewportBackground(prev.three);
            renderer.three.shadowMap.enabled = false;
            return;
          }
          if (!isShadowed(prev) && settings) {
            applySimpleLightConfig(prev, settings, sunDirForSettings(settings));
            applyViewportBackground(prev.three);
            renderer.three.shadowMap.enabled = false;
            return;
          }

          const next = new OBC.SimpleScene(components);
          world.scene = next;
          next.setup();
          applyViewportBackground(next.three);
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

          // Terrain / street models need a longer camera far for CSM distance —
          // keep it modest so a failed depth pass cannot balloon the frustum to 10km.
          if ("far" in world.camera.three && typeof world.camera.three.far === "number") {
            if (world.camera.three.far < 2000) world.camera.three.far = 2000;
          }

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
            applyViewportBackground(next.three);
            next.autoBias = false;
            next.bias = settings.shadowBias;
            next.shadowsEnabled = true;
            addShadowGround(next);
            excludeNonModelFromDistance(next);
            migrateSceneContents(prev.three, next.three);
            disposePreviousScene(prev);
            renderer.three.shadowMap.enabled = true;
            renderer.three.shadowMap.type = THREE.VSMShadowMap;
            renderer.three.shadowMap.needsUpdate = true;
            applyShadowedLightConfig(next, settings, dir);
            syncDistanceRendererCamera(next, world.camera.three);
            applyFragmentShadowFlags();
            requestShadowUpdate(next);
            // Tiles may finish streaming a frame later — refresh flags + CSM again.
            void fragments.core.update(true).then(() => {
              applyFragmentShadowFlags();
              const scene = world.scene as AnyScene;
              if (isShadowed(scene) && scene.shadowsEnabled) {
                syncDistanceRendererCamera(scene, world.camera.three);
                requestShadowUpdate(scene);
              }
            });
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
            applyViewportBackground(prev.three);
            addShadowGround(prev);
            excludeNonModelFromDistance(prev);
          }

          prev.autoBias = false;
          prev.bias = settings.shadowBias;
          prev.shadowsEnabled = true;
          applyShadowedLightConfig(prev, settings, dir);
          renderer.three.shadowMap.enabled = true;
          renderer.three.shadowMap.type = THREE.VSMShadowMap;
          renderer.three.shadowMap.needsUpdate = true;
          syncDistanceRendererCamera(prev, world.camera.three);
          excludeNonModelFromDistance(prev);
          applyFragmentShadowFlags();
          requestShadowUpdate(prev);
        };

        // Camera rest refreshes cascaded shadows (not every "update" — too hot).
        world.camera.controls.addEventListener("rest", () => {
          const scene = world.scene as AnyScene;
          if (isShadowed(scene) && scene.shadowsEnabled) {
            syncDistanceRendererCamera(scene, world.camera.three);
            applyFragmentShadowFlags();
            requestShadowUpdate(scene);
          }
        });

        lightsApiRef.current = {
          apply: (settings, opts) => {
            if (opts?.resetOriginal) {
              // Reset → user-locked preset (shadows on), not bare SimpleScene.
              ensureShadowedScene(DEFAULT_LIGHTS, true);
              return;
            }
            if (settings.shadowsEnabled) {
              ensureShadowedScene(settings, Boolean(opts?.rebuildShadows));
            } else {
              ensureSimpleScene(settings);
            }
          },
        };
        // Apply locked light preset (includes ShadowedScene).
        lightsApiRef.current.apply(DEFAULT_LIGHTS, { rebuildShadows: true });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fragments.list.onItemSet.add(({ value: model }: { value: any }) => {
          model.useCamera(world.camera.three);
          world.scene.three.add(model.object);
          enableMeshShadows(model.object);
          // That Open ShadowedScene / Fragments samples: per-tile cast + receive.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          model.tiles?.onItemSet?.add(({ value: mesh }: { value: any }) => {
            if (mesh && "isMesh" in mesh) enableTileShadows(mesh);
          });
          void fragments.core.update(true);
          const scene = world.scene as AnyScene;
          if (isShadowed(scene) && scene.shadowsEnabled) {
            scheduleShadowRefresh(() => {
              const s = world.scene as AnyScene;
              if (!isShadowed(s) || !s.shadowsEnabled) return;
              applyFragmentShadowFlags();
              syncDistanceRendererCamera(s, world.camera.three);
              requestShadowUpdate(s);
            });
          }
        });

        loadIfcRef.current = async (input: LoadIfcInput) => {
          const existingIds = [...fragments.list.keys()];
          for (const modelId of existingIds) {
            await fragments.core.disposeModel(modelId);
          }
          setStatus(`Converting ${input.name}…`);
          await ifcLoader.load(input.data, false, input.name.replace(/\.[^.]+$/, "") || "model", {
            processData: {
              progressCallback: (progress: number) => {
                setStatus(`Converting ${input.name}… ${Math.round(progress * 100)}%`);
              },
            },
          });
          setIfc({ name: input.name, sizeBytes: input.sizeBytes, loaded: true });
          setStatus(`Loaded ${input.name}`);
          await fragments.core.update(true);
          const scene = world.scene as AnyScene;
          if (isShadowed(scene) && scene.shadowsEnabled) {
            scheduleShadowRefresh(() => {
              const s = world.scene as AnyScene;
              if (!isShadowed(s) || !s.shadowsEnabled) return;
              applyFragmentShadowFlags();
              syncDistanceRendererCamera(s, world.camera.three);
              requestShadowUpdate(s);
            });
          }
        };

        offloadIfcRef.current = async () => {
          const modelIds = [...fragments.list.keys()];
          for (const modelId of modelIds) {
            await fragments.core.disposeModel(modelId);
          }
          void fragments.core.update(true);
          const scene = world.scene as AnyScene;
          if (isShadowed(scene) && scene.shadowsEnabled) requestShadowUpdate(scene);
        };

        disposeRef.current = () => {
          lightsApiRef.current = null;
          themeObserver.disconnect();
          try {
            components.dispose();
          } catch {
            /* ignore dispose races */
          }
        };
        setStatus("Loading library…");
        setViewerReady(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setStatus(`Viewer failed: ${msg}`);
      }
    })();

    return () => {
      cancelled = true;
      setViewerReady(false);
      disposeRef.current?.();
      disposeRef.current = null;
      loadIfcRef.current = null;
      offloadIfcRef.current = null;
      lightsApiRef.current = null;
    };
  }, [ready]);

  const patchLights = useCallback((patch: Partial<LightSettings>, rebuildShadows = false) => {
    setLights((prev) => {
      const next = { ...prev, ...patch };
      lightsApiRef.current?.apply(next, { rebuildShadows });
      return next;
    });
  }, []);

  const onFile = useCallback(async () => {
    if (!uploadFile || !loadIfcRef.current) return;
    const stem = normalizeLibraryNameInput(uploadName);
    if (!LIBRARY_NAME_PATTERN.test(stem)) {
      setStatus("Library name: 2–120 chars; start with a letter/number; only . _ - allowed.");
      return;
    }
    setUploading(true);
    try {
      const data = new Uint8Array(await uploadFile.arrayBuffer());
      const token = getAuthToken().trim();
      if (!token) {
        setStatus("Sign in as admin to upload.");
        return;
      }
      const body = new FormData();
      body.append("file", uploadFile);
      body.append("name", stem);
      const res = await fetch(BIM_ROUTES.modelUpload, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      const payload = (await res.json()) as { model?: LibraryModel; error?: string; message?: string };
      if (!res.ok) {
        setStatus(payload.error || payload.message || `Upload failed (${res.status})`);
        return;
      }
      const storedName = payload.model?.name || `${stem}.ifc`;
      await loadIfcRef.current({ name: storedName, sizeBytes: uploadFile.size, data });
      setUploadOpen(false);
      setUploadFile(null);
      setUploadName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setStatus(`Uploaded & loaded ${storedName}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Upload failed: ${msg}`);
      setIfc({ name: uploadFile.name, sizeBytes: uploadFile.size, loaded: false });
    } finally {
      setUploading(false);
    }
  }, [uploadFile, uploadName]);

  const refreshLibrary = useCallback(async () => {
    setLibraryLoading(true);
    setLibraryStatus("Loading library…");
    try {
      const res = await fetch(BIM_ROUTES.models);
      const data = (await res.json()) as { models?: LibraryModel[]; error?: string };
      if (!res.ok) {
        setLibraryStatus(data.error || `HTTP ${res.status}`);
        setLibrary([]);
        return;
      }
      const models = sortLibrary(data.models ?? []);
      setLibrary(models);
      setLibraryStatus(models.length === 0 ? "No models in ifcbim/library yet." : "");
    } catch (err) {
      setLibraryStatus(err instanceof Error ? err.message : String(err));
      setLibrary([]);
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  const loadLibraryModel = useCallback(async (model: LibraryModel) => {
    if (!loadIfcRef.current) return;
    setLibraryStatus(`Fetching ${model.name}…`);
    try {
      const res = await fetch(model.url);
      if (!res.ok) {
        setLibraryStatus(`Fetch failed (${res.status})`);
        return;
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      await loadIfcRef.current({ name: model.name, sizeBytes: model.sizeBytes || buf.byteLength, data: buf });
      setBrowseOpen(false);
    } catch (err) {
      setLibraryStatus(err instanceof Error ? err.message : String(err));
    }
  }, []);

  // Spec 037: after scene ready, auto-load the first library model (by name).
  useEffect(() => {
    if (!viewerReady) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(BIM_ROUTES.models);
        const data = (await res.json()) as { models?: LibraryModel[]; error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setStatus(data.error || `Library unavailable (${res.status})`);
          return;
        }
        const models = sortLibrary(data.models ?? []);
        setLibrary(models);
        const first = models[0];
        if (!first) {
          setStatus("No models in ifcbim/library yet.");
          return;
        }
        if (!loadIfcRef.current) return;
        setStatus(`Loading ${first.name}…`);
        const fileRes = await fetch(first.url);
        if (cancelled) return;
        if (!fileRes.ok) {
          setStatus(`Could not load ${first.name} (${fileRes.status})`);
          return;
        }
        const buf = new Uint8Array(await fileRes.arrayBuffer());
        if (cancelled || !loadIfcRef.current) return;
        await loadIfcRef.current({
          name: first.name,
          sizeBytes: first.sizeBytes || buf.byteLength,
          data: buf,
        });
      } catch (err) {
        if (!cancelled) {
          setStatus(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewerReady]);

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
          ? `Python ok (exit ${data.exitCode})`
          : `Python failed (exit ${data.exitCode})`,
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
    setBrowseOpen(false);
    setConsoleOpen(false);
    setOutputOpen(false);
    setUploadOpen((v) => !v);
  }, []);

  const openBrowse = useCallback(() => {
    setUploadOpen(false);
    setConsoleOpen(false);
    setOutputOpen(false);
    setBrowseOpen((v) => {
      const next = !v;
      if (next) void refreshLibrary();
      return next;
    });
  }, [refreshLibrary]);

  const openLights = useCallback(() => {
    setLightsOpen((v) => !v);
  }, []);

  const openConsole = useCallback(() => {
    setUploadOpen(false);
    setBrowseOpen(false);
    setOutputOpen(false);
    setConsoleOpen((v) => !v);
  }, []);

  const openOutput = useCallback(() => {
    setUploadOpen(false);
    setBrowseOpen(false);
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
      setStatus("Model offloaded.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Offload failed: ${msg}`);
    }
  }, [ifc.loaded]);

  if (!ready) {
    return <p className="bim-ifc-viewer__gate">Loading viewer…</p>;
  }

  return (
    <div className="bim-ifc-viewer">
      <BimIfcHeaderMenu
        isAdmin={isAdmin}
        uploadOpen={uploadOpen}
        browseOpen={browseOpen}
        lightsOpen={lightsOpen}
        consoleOpen={consoleOpen}
        outputOpen={outputOpen}
        modelLoaded={ifc.loaded}
        onToggleUpload={openUpload}
        onToggleBrowse={openBrowse}
        onToggleLights={openLights}
        onToggleConsole={openConsole}
        onToggleOutput={openOutput}
        onOffloadModel={() => void offloadModel()}
      />

      <div className={`bim-ifc-viewer__stage${lightsOpen ? " bim-ifc-viewer__stage--lights-open" : ""}`}>
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
                onChange={(e) => patchLights({ shadowsEnabled: e.target.checked }, e.target.checked)}
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
              Admin only. Stores as <code>ifcbim/library/&#123;name&#125;.ifc</code>. Names must be unique — duplicates
              are rejected.
            </p>
            <label className="bim-ifc-viewer__field bim-ifc-viewer__field--stack">
              <span>Library name</span>
              <input
                type="text"
                className="bim-ifc-viewer__text-input"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="e.g. street-cars-2026-08-29"
                pattern="[A-Za-z0-9][A-Za-z0-9._\-]{1,119}"
                minLength={2}
                maxLength={120}
                required
                disabled={uploading}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <p className="bim-ifc-viewer__meta">
              Use letters/numbers; optional <code>.</code> <code>_</code> <code>-</code>. Min 2 characters. Do not
              include <code>.ifc</code> (added automatically).
            </p>
            <label className="bim-ifc-viewer__upload bim-ifc-viewer__upload--modal">
              <span>Choose IFC file</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".ifc,application/x-step,application/octet-stream"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setUploadFile(file);
                  if (file && !uploadName.trim()) {
                    setUploadName(normalizeLibraryNameInput(file.name));
                  }
                }}
              />
            </label>
            <p className="bim-ifc-viewer__meta" role="status">
              {uploading ? "Uploading…" : status}
            </p>
            <div className="bim-ifc-viewer__modal-actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={uploading || !uploadFile || !LIBRARY_NAME_PATTERN.test(normalizeLibraryNameInput(uploadName))}
                onClick={() => void onFile()}
              >
                {uploading ? "Uploading…" : "Upload & load"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {browseOpen ? (
        <div className="bim-ifc-viewer__modal" role="dialog" aria-modal="true" aria-label="Browse IFC models">
          <div className="bim-ifc-viewer__modal-panel">
            <header className="bim-ifc-viewer__modal-head">
              <h2>Browse models</h2>
              <button type="button" className="bim-ifc-viewer__close" onClick={() => setBrowseOpen(false)}>
                Close
              </button>
            </header>
            <p className="bim-ifc-viewer__hint">
              Shared library <code>ifcbim/library/</code>. Each row shows name, size, and last modified date.
            </p>
            <div className="bim-ifc-viewer__modal-actions bim-ifc-viewer__modal-actions--start">
              <button type="button" className="btn" disabled={libraryLoading} onClick={() => void refreshLibrary()}>
                {libraryLoading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
            {libraryStatus ? <p className="bim-ifc-viewer__meta">{libraryStatus}</p> : null}
            <ul className="bim-ifc-viewer__library-list">
              {library.map((model) => (
                <li key={model.key} className="bim-ifc-viewer__library-item">
                  <div className="bim-ifc-viewer__library-meta">
                    <span className="bim-ifc-viewer__library-name">{model.name}</span>
                    <span className="bim-ifc-viewer__library-sub">
                      {formatLibraryDate(model.lastModified) || "Date unknown"}
                      {model.sizeHuman ? ` · ${model.sizeHuman}` : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => void loadLibraryModel(model)}
                  >
                    Load
                  </button>
                </li>
              ))}
            </ul>
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
