/**
 * eReport editor — Issue Tracker iframe; supports legacy flat + org reports (046).
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { APP_ROUTES } from "../../config/routes";
import {
  fetchEreport,
  fetchEreportOrg,
  fetchOrgEreport,
  listEreportHistory,
  putEreportShares,
  resolveEreportEditorFromLocation,
  restoreEreportHistory,
  saveEreport,
  saveOrgEreport,
  updateEreportOrgs,
  ereportPrettyPath,
  type EreportHistoryCard,
  type EreportMeta,
  type EreportPayload,
} from "../../lib/ereport";
import EreportHeaderMenu, {
  type EreportModalKind,
  type EreportTrackerCommand,
} from "./EreportHeaderMenu";
import "./Ereport.css";

const TRACKER_SRC = "/ereport-tracker.html?v=062a";

function siteIsDark(): boolean {
  return (
    document.documentElement.getAttribute("data-theme") === "dark" ||
    document.documentElement.classList.contains("dark")
  );
}

type EditorIds = {
  ownerSafe: string;
  reportId: string;
  orgId?: string;
};

function resolveEditorIds(): EditorIds | null {
  const base = resolveEreportEditorFromLocation();
  if (!base) return null;
  const params = new URLSearchParams(window.location.search);
  const orgId = params.get("org")?.trim() || undefined;
  return { ...base, orgId };
}

export default function EreportEditor() {
  const [ids, setIds] = useState<EditorIds | null>(null);
  const [meta, setMeta] = useState<EreportMeta | null>(null);
  const [tema, setTema] = useState("");
  const [shareInput, setShareInput] = useState("");
  const [canShare, setCanShare] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyShare, setBusyShare] = useState(false);
  const [trackerReady, setTrackerReady] = useState(false);
  const [modal, setModal] = useState<EreportModalKind>(null);
  const [historyItems, setHistoryItems] = useState<EreportHistoryCard[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const payloadRef = useRef<EreportPayload | null>(null);

  useEffect(() => {
    const resolved = resolveEditorIds();
    setIds(resolved);
    if (resolved && !resolved.orgId) {
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
      const res = ids.orgId
        ? await fetchOrgEreport(ids.orgId, ids.reportId)
        : await fetchEreport(ids.ownerSafe, ids.reportId);
      if (cancelled) return;
      if (res.error || !res.meta || !res.payload) {
        setError(res.error ?? "No encontrado");
        setLoading(false);
        return;
      }
      setMeta(res.meta);
      setTema(res.meta.tema);
      setCanShare(res.canShare);
      let orgName = "";
      if (ids.orgId) {
        const orgRes = await fetchEreportOrg(ids.orgId);
        orgName = orgRes.org?.name ?? "";
      }
      payloadRef.current = {
        ...res.payload,
        reportName:
          String(res.payload.reportName || res.meta.tema || "").trim() ||
          res.meta.tema,
        orgName: String(res.payload.orgName || orgName || "").trim(),
      };
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ids?.ownerSafe, ids?.reportId, ids?.orgId]);

  const postToTracker = useCallback((msg: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(
      { target: "ereport-tracker", ...msg },
      window.location.origin,
    );
  }, []);

  const onTrackerCommand = useCallback(
    (command: EreportTrackerCommand) => {
      if (command === "toggle-sidebar") {
        setSidebarCollapsed((v) => !v);
      }
      postToTracker({ type: "command", command });
    },
    [postToTracker],
  );

  const persist = useCallback(
    async (body: { tema?: string; payload?: EreportPayload }) => {
      if (!ids) return { meta: null as EreportMeta | null, error: "missing ids" };
      let res;
      if (ids.orgId) {
        res = await saveOrgEreport(ids.orgId, ids.reportId, body);
        const orgName = String(body.payload?.orgName || "").trim();
        if (!res.error && orgName) {
          await updateEreportOrgs([{ id: ids.orgId, name: orgName }]);
        }
      } else {
        res = await saveEreport(ids.ownerSafe, ids.reportId, body);
      }
      return res;
    },
    [ids],
  );

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return;
      const d = ev.data;
      if (!d || d.source !== "ereport-tracker") return;
      /* Boot once with cloud payload. "loaded" (incl. local file pick) only re-syncs theme —
         never re-pushes payloadRef or a file load would be wiped by the cloud copy. */
      if (d.type === "booted") {
        setTrackerReady(true);
        if (payloadRef.current) {
          postToTracker({ type: "load", payload: payloadRef.current });
        }
        postToTracker({ type: "theme", dark: siteIsDark() });
      }
      if (d.type === "loaded") {
        postToTracker({ type: "theme", dark: siteIsDark() });
      }
      if (d.type === "cloud-save" && ids && d.payload) {
        void (async () => {
          setSaving(true);
          const payload = d.payload as EreportPayload;
          const nextTema =
            String(payload.reportName || payload.appTitle || tema || "").trim() ||
            tema;
          setTema(nextTema);
          const res = await persist({
            payload,
            tema: nextTema,
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
  }, [ids, tema, postToTracker, persist]);

  useEffect(() => {
    if (!trackerReady || !payloadRef.current) return;
    postToTracker({ type: "load", payload: payloadRef.current });
    postToTracker({ type: "theme", dark: siteIsDark() });
  }, [trackerReady, postToTracker]);

  /* Follow Header theme toggler — push into iframe whenever html theme attrs change. */
  useEffect(() => {
    if (!trackerReady) return;
    const push = () => postToTracker({ type: "theme", dark: siteIsDark() });
    push();
    const obs = new MutationObserver(push);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class"],
    });
    return () => obs.disconnect();
  }, [trackerReady, postToTracker]);

  async function onSaveTema() {
    if (!ids || !meta) return;
    setSaving(true);
    setError("");
    const res = await persist({ tema });
    setSaving(false);
    if (res.error) setError(res.error);
    else if (res.meta) {
      setMeta(res.meta);
      setModal(null);
    }
  }

  async function onSaveCloud() {
    if (!ids) return;
    setError("");
    const handler = async (ev: MessageEvent) => {
      if (ev.data?.source !== "ereport-tracker" || ev.data?.type !== "state") return;
      window.removeEventListener("message", handler);
      setSaving(true);
      const payload = ev.data.payload as EreportPayload;
      const nextTema =
        String(payload.reportName || payload.appTitle || tema || "").trim() ||
        tema;
      setTema(nextTema);
      const res = await persist({
        tema: nextTema,
        payload,
      });
      setSaving(false);
      if (res.error) setError(res.error);
      else if (res.meta) {
        setMeta(res.meta);
        setModal(null);
      }
    };
    window.addEventListener("message", handler);
    postToTracker({ type: "collect" });
  }

  async function onAddShare(e: FormEvent) {
    e.preventDefault();
    if (!ids || !meta || !canShare || ids.orgId) return;
    const email = shareInput.trim();
    if (!email) return;
    const emails = [...meta.sharedWith.map((s) => s.email), email];
    setBusyShare(true);
    setError("");
    const res = await putEreportShares(ids.ownerSafe, ids.reportId, emails);
    setBusyShare(false);
    if (res.error) setError(res.error);
    else if (res.meta) {
      setMeta(res.meta);
      setShareInput("");
    }
  }

  async function onRemoveShare(email: string) {
    if (!ids || !meta || !canShare || ids.orgId) return;
    const emails = meta.sharedWith.filter((s) => s.email !== email).map((s) => s.email);
    setBusyShare(true);
    setError("");
    const res = await putEreportShares(ids.ownerSafe, ids.reportId, emails);
    setBusyShare(false);
    if (res.error) setError(res.error);
    else if (res.meta) setMeta(res.meta);
  }

  async function onLoadHistory() {
    if (!ids || ids.orgId) return;
    setHistoryLoading(true);
    setError("");
    const res = await listEreportHistory(ids.ownerSafe, ids.reportId);
    setHistoryLoading(false);
    if (res.error) setError(res.error);
    else setHistoryItems(res.items);
  }

  async function onRestoreHistory(snapshotId: string) {
    if (!ids || ids.orgId) return;
    if (
      !window.confirm(
        "¿Restaurar esta versión? Se guarda una instantánea del estado actual antes de reemplazar.",
      )
    ) {
      return;
    }
    setHistoryBusy(true);
    setError("");
    const res = await restoreEreportHistory(ids.ownerSafe, ids.reportId, snapshotId);
    setHistoryBusy(false);
    if (res.error || !res.meta || !res.payload) {
      setError(res.error ?? "No se pudo restaurar");
      return;
    }
    setMeta(res.meta);
    setTema(res.meta.tema);
    payloadRef.current = res.payload;
    postToTracker({ type: "load", payload: res.payload });
    await onLoadHistory();
    setModal(null);
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
      {ids ? (
        <EreportHeaderMenu
          ownerSafe={ids.ownerSafe}
          tema={tema}
          onTemaChange={setTema}
          onSaveTema={onSaveTema}
          onSaveCloud={onSaveCloud}
          saving={saving}
          canShare={canShare && !ids.orgId}
          canHistory={canShare && !ids.orgId}
          historyItems={historyItems}
          historyLoading={historyLoading}
          onLoadHistory={onLoadHistory}
          onRestoreHistory={onRestoreHistory}
          historyBusy={historyBusy}
          meta={meta}
          shareInput={shareInput}
          onShareInputChange={setShareInput}
          onAddShare={onAddShare}
          onRemoveShare={onRemoveShare}
          busyShare={busyShare}
          error={error}
          modal={modal}
          onOpenModal={setModal}
          onCloseModal={() => setModal(null)}
          onTrackerCommand={onTrackerCommand}
          sidebarCollapsed={sidebarCollapsed}
        />
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
