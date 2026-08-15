/**
 * OpenBIM library: list models, upload real IFC bytes, preview text head, download.
 * Lightweight — no That Open / web-ifc / three (keeps Astro build memory low).
 */

import { useCallback, useEffect, useState } from "react";
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
import "./BimPage.css";

function formatBytes(n: number): string {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BimPage() {
  const [models, setModels] = useState<BimModel[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [activeId, setActiveId] = useState("");
  const [preview, setPreview] = useState("");
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  const [previewMeta, setPreviewMeta] = useState("");
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

  async function onCreatePlaceholder() {
    setError("");
    setUploading(true);
    try {
      const saved = await createBimModel(`model-${Date.now()}.ifc`);
      setModels((prev) => [saved, ...prev.filter((m) => m.modelId !== saved.modelId)]);
      await openModel(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setUploading(false);
    }
  }

  async function openModel(model: BimModel) {
    setError("");
    setActiveId(model.modelId);
    setViewerStatus("Downloading IFC…");
    setPreview("");
    setFileBytes(null);
    setPreviewMeta("");
    try {
      const file = await fetchBimFileBytes(model.modelId);
      setFileBytes(file.bytes);
      setPreview(file.textPreview);
      const truncated =
        file.byteLength > file.textPreview.length
          ? ` · preview ${formatBytes(file.textPreview.length)} of ${formatBytes(file.byteLength)}`
          : "";
      setPreviewMeta(
        `${formatBytes(file.byteLength)} · ${file.contentType}${truncated}`,
      );
      setViewerStatus("File ready — text preview (no 3D viewer in this build)");
    } catch (err) {
      setViewerStatus("");
      setError(err instanceof Error ? err.message : "Could not open IFC");
    }
  }

  const active = models.find((m) => m.modelId === activeId);

  return (
    <div className="bim-page">
      <aside className="bim-page__library" aria-label="IFC models">
        <header className="bim-page__library-head">
          <h1 className="bim-page__title">OpenBIM</h1>
          <p className="bim-page__lead">
            Upload real IFC bytes to <code>/api/bim/models</code>. Memory store keeps
            them in-process; set <code>IFCBIM_S3_BUCKET</code> on the Next backend for
            S3-backed objects under <code>ifcbim/</code>.
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

      <section className="bim-page__viewer" aria-label="IFC file preview">
        {!activeId ? (
          <p className="bim-page__viewer-status">Select a model to preview its IFC bytes.</p>
        ) : (
          <>
            <div className="bim-page__viewer-bar">
              <div>
                <h2 className="bim-page__viewer-title">{active?.name || activeId}</h2>
                {previewMeta ? <p className="bim-page__viewer-meta">{previewMeta}</p> : null}
                {viewerStatus ? <p className="bim-page__viewer-status">{viewerStatus}</p> : null}
              </div>
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
            <div className="bim-page__canvas" role="status">
              <p className="bim-page__canvas-msg">
                Lightweight preview — full That Open / web-ifc 3D viewer is deferred to
                keep build memory predictable.
              </p>
            </div>
            {preview ? (
              <pre className="bim-page__preview" tabIndex={0}>
                {preview}
              </pre>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
