/**
 * eReport editor — tema + share + portable Issue Tracker iframe.
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { APP_ROUTES } from "../../config/routes";
import {
  fetchEreport,
  putEreportShares,
  resolveEreportEditorFromLocation,
  saveEreport,
  ereportPrettyPath,
  type EreportMeta,
  type EreportPayload,
} from "../../lib/ereport";
import "./Ereport.css";

const TRACKER_SRC = "/ereport-tracker.html";

export default function EreportEditor() {
  const [ids, setIds] = useState<{ ownerSafe: string; reportId: string } | null>(
    null,
  );
  const [meta, setMeta] = useState<EreportMeta | null>(null);
  const [tema, setTema] = useState("");
  const [shareInput, setShareInput] = useState("");
  const [canShare, setCanShare] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [trackerReady, setTrackerReady] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const payloadRef = useRef<EreportPayload | null>(null);

  useEffect(() => {
    const resolved = resolveEreportEditorFromLocation();
    setIds(resolved);
    if (resolved) {
      const pretty = ereportPrettyPath(resolved.ownerSafe, resolved.reportId);
      if (window.location.pathname.replace(/\/+$/, "") !== pretty) {
        window.history.replaceState(null, "", pretty);
      }
    }
  }, []);

  useEffect(() => {
    if (!ids) {
      if (typeof window !== "undefined" && !resolveEreportEditorFromLocation()) {
        setError("Ruta de reporte inválida.");
        setLoading(false);
      }
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await fetchEreport(ids.ownerSafe, ids.reportId);
      if (cancelled) return;
      if (res.error || !res.meta || !res.payload) {
        setError(res.error ?? "No encontrado");
        setLoading(false);
        return;
      }
      setMeta(res.meta);
      setTema(res.meta.tema);
      setCanShare(res.canShare);
      payloadRef.current = res.payload;
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ids?.ownerSafe, ids?.reportId]);

  const postToTracker = useCallback((msg: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(
      { target: "ereport-tracker", ...msg },
      window.location.origin,
    );
  }, []);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return;
      const d = ev.data;
      if (!d || d.source !== "ereport-tracker") return;
      if (d.type === "booted" || d.type === "loaded") {
        setTrackerReady(true);
        if (payloadRef.current) {
          postToTracker({ type: "load", payload: payloadRef.current });
        }
      }
      if (d.type === "cloud-save" && ids && d.payload) {
        void (async () => {
          setSaving(true);
          const res = await saveEreport(ids.ownerSafe, ids.reportId, {
            payload: d.payload as EreportPayload,
            tema,
          });
          setSaving(false);
          if (res.error) setError(res.error);
          else if (res.meta) setMeta(res.meta);
        })();
      }
      if (d.type === "error") {
        setError(String(d.message || "Tracker error"));
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [ids, tema, postToTracker]);

  useEffect(() => {
    if (!trackerReady || !payloadRef.current) return;
    postToTracker({ type: "load", payload: payloadRef.current });
    const dark =
      document.documentElement.getAttribute("data-theme") === "dark" ||
      document.documentElement.classList.contains("dark");
    postToTracker({ type: "theme", dark });
  }, [trackerReady, postToTracker]);

  async function onSaveTema() {
    if (!ids || !meta) return;
    setSaving(true);
    const res = await saveEreport(ids.ownerSafe, ids.reportId, { tema });
    setSaving(false);
    if (res.error) setError(res.error);
    else if (res.meta) setMeta(res.meta);
  }

  async function onSaveCloud() {
    if (!ids) return;
    postToTracker({ type: "collect" });
    // collect replies via message — also request explicit save after short wait
    await new Promise((r) => setTimeout(r, 50));
    // Ask tracker to emit state then we save:
    const handler = async (ev: MessageEvent) => {
      if (ev.data?.source !== "ereport-tracker" || ev.data?.type !== "state") return;
      window.removeEventListener("message", handler);
      setSaving(true);
      const res = await saveEreport(ids.ownerSafe, ids.reportId, {
        tema,
        payload: ev.data.payload as EreportPayload,
      });
      setSaving(false);
      if (res.error) setError(res.error);
      else if (res.meta) setMeta(res.meta);
    };
    window.addEventListener("message", handler);
    postToTracker({ type: "collect" });
  }

  async function onAddShare(e: FormEvent) {
    e.preventDefault();
    if (!ids || !meta || !canShare) return;
    const email = shareInput.trim();
    if (!email) return;
    const emails = [
      ...meta.sharedWith.map((s) => s.email),
      email,
    ];
    setBusyShare(true);
    const res = await putEreportShares(ids.ownerSafe, ids.reportId, emails);
    setBusyShare(false);
    if (res.error) setError(res.error);
    else if (res.meta) {
      setMeta(res.meta);
      setShareInput("");
    }
  }

  const [busyShare, setBusyShare] = useState(false);

  async function onRemoveShare(email: string) {
    if (!ids || !meta || !canShare) return;
    const emails = meta.sharedWith.filter((s) => s.email !== email).map((s) => s.email);
    setBusyShare(true);
    const res = await putEreportShares(ids.ownerSafe, ids.reportId, emails);
    setBusyShare(false);
    if (res.error) setError(res.error);
    else if (res.meta) setMeta(res.meta);
  }

  if (loading) {
    return <p className="ereport-hub__empty">Cargando eReport…</p>;
  }

  if (error && !meta) {
    return (
      <p className="ereport-hub__error">
        {error}{" "}
        <a href={APP_ROUTES.ereport}>Volver</a>
      </p>
    );
  }

  return (
    <div className="ereport-editor">
      <header className="ereport-editor__chrome">
        <a className="btn" href={meta ? APP_ROUTES.ereportUser(meta.ownerSafe) : APP_ROUTES.ereport}>
          Hub
        </a>
        <label className="ereport-editor__tema">
          Tema
          <input
            value={tema}
            onChange={(e) => setTema(e.target.value)}
            onBlur={() => void onSaveTema()}
            maxLength={200}
          />
        </label>
        <button
          type="button"
          className="btn btn--primary"
          disabled={saving}
          onClick={() => void onSaveCloud()}
        >
          {saving ? "Guardando…" : "Guardar en nube"}
        </button>
        {error ? <span className="ereport-hub__error">{error}</span> : null}
      </header>

      {canShare && meta ? (
        <section className="ereport-share" aria-label="Compartir">
          <form className="ereport-share__form" onSubmit={(e) => void onAddShare(e)}>
            <label htmlFor="ereport-share-email">Compartir con usuario registrado</label>
            <div className="ereport-hub__row">
              <input
                id="ereport-share-email"
                type="email"
                value={shareInput}
                onChange={(e) => setShareInput(e.target.value)}
                placeholder="email@ejemplo.com"
              />
              <button className="btn" type="submit" disabled={busyShare}>
                Añadir
              </button>
            </div>
          </form>
          <ul className="ereport-share__list">
            {(meta.sharedWith ?? []).map((s) => (
              <li key={s.email}>
                {s.email}
                <button
                  type="button"
                  className="ereport-card__del"
                  onClick={() => void onRemoveShare(s.email)}
                  disabled={busyShare}
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <iframe
        ref={iframeRef}
        className="ereport-editor__frame"
        title="Issue Tracker"
        src={TRACKER_SRC}
      />
    </div>
  );
}
