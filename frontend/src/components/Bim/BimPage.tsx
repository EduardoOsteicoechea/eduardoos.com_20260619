import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { APP_ROUTES } from "../../config/routes";
import { isAuthenticated } from "../../lib/auth";
import {
  fetchBimFile,
  fetchBimModels,
  uploadBimModel,
  type IfcBimRecord,
} from "../../lib/bim";
import "./BimPage.css";

const IfcViewer = lazy(() => import("./IfcViewer"));
function formatBytes(n: number): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BimPage() {
  const [models, setModels] = useState<IfcBimRecord[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [activeId, setActiveId] = useState("");
  const [ifcBytes, setIfcBytes] = useState<Uint8Array | null>(null);
  const [viewerStatus, setViewerStatus] = useState("");

  const loadList = useCallback(async () => {
    const list = await fetchBimModels();
    setModels(list);
  }, []);

  useEffect(() => {
    if (!isAuthenticated()) {
      window.location.href = `${APP_ROUTES.login}?next=${encodeURIComponent(APP_ROUTES.bim)}`;
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await loadList();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load models");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadList]);

  async function onUpload(file: File | undefined) {
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const saved = await uploadBimModel(file);
      setModels((prev) => [saved, ...prev.filter((m) => m.modelId !== saved.modelId)]);
      await openModel(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function openModel(model: IfcBimRecord) {
    setError("");
    setActiveId(model.modelId);
    setViewerStatus("Downloading IFC…");
    setIfcBytes(null);
    try {
      const bytes = await fetchBimFile(model.modelId);
      setIfcBytes(bytes);
      setViewerStatus("");
    } catch (err) {
      setViewerStatus("");
      setError(err instanceof Error ? err.message : "Could not open IFC");
    }
  }

  return (
    <div className="bim-page">
      <aside className="bim-page__library" aria-label="IFC models">
        <header className="bim-page__library-head">
          <h1 className="bim-page__title">BIM</h1>
          <p className="bim-page__lead">
            Your IFC models in S3 <code>ifcbim/</code>. Select one to convert and view.
          </p>
          <label className="bim-page__upload">
            <input
              type="file"
              accept=".ifc,.ifczip,application/x-step"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                void onUpload(file);
              }}
            />
            <span>{uploading ? "Uploading…" : "Upload IFC"}</span>
          </label>
        </header>
        {loading && <p className="bim-page__status">Loading models…</p>}
        {error && <p className="bim-page__error">{error}</p>}
        {!loading && models.length === 0 && (
          <p className="bim-page__status">No models yet. Upload an IFC to get started.</p>
        )}
        <ul className="bim-page__list">
          {models.map((model) => (
            <li key={model.modelId}>
              <button
                type="button"
                className={`bim-page__item${activeId === model.modelId ? " is-active" : ""}`}
                onClick={() => void openModel(model)}
              >
                <span className="bim-page__item-title">{model.title || model.fileName}</span>
                <span className="bim-page__item-meta">
                  {[model.fileName, formatBytes(model.contentSizeBytes)].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="bim-page__viewer" aria-label="IFC viewer">
        {viewerStatus && <p className="bim-page__viewer-status">{viewerStatus}</p>}
        <Suspense fallback={<p className="bim-page__viewer-status">Loading viewer…</p>}>
          <IfcViewer
            buffer={ifcBytes}
            modelName={models.find((m) => m.modelId === activeId)?.fileName || "model"}
          />
        </Suspense>
      </section>
    </div>
  );
}
