/**
 * OpenBIM library: list models, upload real IFC bytes, download, and view in
 * That Open / Three.js (IfcViewer island). API failures use ServerErrorModal;
 * viewer conversion errors stay in-panel so the page does not blank.
 */

import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { APP_ROUTES } from "../../config/routes";
import {
  createBimModel,
  downloadBimBytes,
  fetchBimFileBytes,
  fetchBimModels,
  uploadBimModel,
  type BimModel,
} from "../../lib/bim";
import { isAuthenticated } from "../../lib/auth";
import { openApiErrorModal } from "../ServerErrorModal/ServerErrorModal";
import "./BimPage.css";

const IfcViewer = lazy(() => import("./IfcViewer"));

function formatBytes(n: number): string {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function reportApiError(err: unknown, summary: string): void {
  const details = err instanceof Error ? err.message : String(err);
  openApiErrorModal(details, {
    title: "OpenBIM error",
    summary,
  });
}

export default function BimPage() {
  const [models, setModels] = useState<BimModel[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [activeId, setActiveId] = useState("");
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  const [previewMeta, setPreviewMeta] = useState("");
  const [viewerStatus, setViewerStatus] = useState("");
  const [showHead, setShowHead] = useState(false);
  const [textPreview, setTextPreview] = useState("");

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
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Could not load models";
          setError(msg);
          reportApiError(err, "Could not list IFC models from /api/bim/models.");
        }
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
      const msg = err instanceof Error ? err.message : "Upload failed";
      setError(msg);
      reportApiError(err, "IFC upload to /api/bim/models failed.");
    } finally {
      setUploading(false);
    }
  }

  async function onCreatePlaceholder() {
    setError("");
    setUploading(true);
    try {
      const saved = await createBimModel(`model-${Date.now()}.ifc`);
      setModels((prev) => [saved, ...prev.filter((m) => m.modelId !== saved.modelId)]);
      await openModel(saved);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Create failed";
      setError(msg);
      reportApiError(err, "Could not create placeholder IFC model.");
    } finally {
      setUploading(false);
    }
  }

  async function openModel(model: BimModel) {
    setError("");
    setActiveId(model.modelId);
    setViewerStatus("Downloading IFC…");
    setFileBytes(null);
    setPreviewMeta("");
    setTextPreview("");
    try {
      const file = await fetchBimFileBytes(model.modelId);
      setFileBytes(file.bytes);
      setTextPreview(file.textPreview);
      setPreviewMeta(
        `${formatBytes(file.byteLength)} · ${file.contentType}`,
      );
      setViewerStatus("");
    } catch (err) {
      setViewerStatus("");
      const msg = err instanceof Error ? err.message : "Could not open IFC";
      setError(msg);
      reportApiError(err, `Could not download IFC bytes for ${model.modelId}.`);
    }
  }

  const active = models.find((m) => m.modelId === activeId);

  return (
    <div className="bim-page">
      <aside className="bim-page__library" aria-label="IFC models">
        <header className="bim-page__library-head">
          <h1 className="bim-page__title">OpenBIM</h1>
          <p className="bim-page__lead">
            Upload IFC to <code>/api/bim/models</code>, then open in the That Open /
            Three.js viewer. Memory store by default; set <code>IFCBIM_S3_BUCKET</code>{" "}
            for S3 under <code>ifcbim/</code>.
          </p>
          <div className="bim-page__actions">
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
              <span>{uploading ? "Working…" : "Upload IFC"}</span>
            </label>
            <button
              type="button"
              className="btn"
              disabled={uploading}
              onClick={() => void onCreatePlaceholder()}
            >
              Create placeholder
            </button>
          </div>
        </header>
        {loading ? <p className="bim-page__status">Loading models…</p> : null}
        {error ? <p className="bim-page__error">{error}</p> : null}
        {!loading && models.length === 0 ? (
          <p className="bim-page__status">No models yet. Upload an IFC or create a placeholder.</p>
        ) : null}
        <ul className="bim-page__list">
          {models.map((model) => (
            <li key={model.modelId}>
              <button
                type="button"
                className={`bim-page__item${activeId === model.modelId ? " is-active" : ""}`}
                onClick={() => void openModel(model)}
              >
                <span className="bim-page__item-title">{model.name || model.modelId}</span>
                <span className="bim-page__item-meta">
                  {[
                    model.modelId.slice(0, 8),
                    model.contentSizeBytes
                      ? formatBytes(model.contentSizeBytes)
                      : null,
                    model.updatedAt,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="bim-page__viewer" aria-label="IFC 3D viewer">
        {!activeId ? (
          <p className="bim-page__viewer-status">Select a model to load it in the 3D viewer.</p>
        ) : (
          <>
            <div className="bim-page__viewer-bar">
              <div>
                <h2 className="bim-page__viewer-title">{active?.name || activeId}</h2>
                {previewMeta ? <p className="bim-page__viewer-meta">{previewMeta}</p> : null}
                {viewerStatus ? <p className="bim-page__viewer-status">{viewerStatus}</p> : null}
              </div>
              <div className="bim-page__viewer-actions">
                {textPreview ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setShowHead((v) => !v)}
                  >
                    {showHead ? "Hide IFC head" : "Show IFC head"}
                  </button>
                ) : null}
                {fileBytes ? (
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() =>
                      downloadBimBytes(activeId, active?.name || activeId, fileBytes)
                    }
                  >
                    Download IFC
                  </button>
                ) : null}
              </div>
            </div>
            <Suspense fallback={<p className="bim-page__viewer-status">Loading viewer…</p>}>
              <IfcViewer
                buffer={fileBytes}
                modelName={active?.name || activeId || "model"}
              />
            </Suspense>
            {showHead && textPreview ? (
              <pre className="bim-page__preview" tabIndex={0}>
                {textPreview}
              </pre>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
