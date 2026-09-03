/**
 * Public magic-link invite UI — org list or single report (spec 046).
 */

import { useCallback, useEffect, useState } from "react";
import {
  fetchEreportInvite,
  saveEreportInviteReport,
  type EreportPayload,
  type ReportCard,
} from "../../lib/ereport";
import {
  DashboardSection,
  ProductHubShell,
} from "../ProductDashboard/ProductDashboard";
import { ViewLoading } from "../ViewLoading/ViewLoading";
import "../ProductDashboard/ProductDashboard.css";
import "./Ereport.css";

function readInviteToken(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  const q = params.get("token") || params.get("t") || "";
  if (q) return q.trim();
  const parts = window.location.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  // /ereport/invite/{token}
  if (parts[0] === "ereport" && parts[1] === "invite" && parts[2]) {
    return decodeURIComponent(parts[2]);
  }
  return "";
}

export default function EreportInvitePage() {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [expired, setExpired] = useState(false);
  const [scope, setScope] = useState<"org" | "report" | "">("");
  const [reports, setReports] = useState<ReportCard[]>([]);
  const [activeReportId, setActiveReportId] = useState("");
  const [tema, setTema] = useState("");
  const [payload, setPayload] = useState<EreportPayload | null>(null);
  const [saving, setSaving] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");

  const load = useCallback(async (tok: string, reportId?: string) => {
    setLoading(true);
    setError("");
    const res = await fetchEreportInvite(tok, reportId);
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setExpired(res.expired);
    setCanEdit(res.canEdit && res.valid && !res.expired);
    setExpiresAt(res.invite?.expiresAt ?? "");
    setScope(res.invite?.scope ?? "");
    if (res.reports?.length) setReports(res.reports);
    if (res.meta) {
      setTema(res.meta.tema);
      setActiveReportId(res.meta.id);
    }
    if (res.payload) setPayload(res.payload);
  }, []);

  useEffect(() => {
    const tok = readInviteToken();
    setToken(tok);
    if (!tok) {
      setError("Missing invite token.");
      setLoading(false);
      return;
    }
    // Pretty path without static file: keep ?token= for static hosting.
    if (!window.location.search.includes("token=") && !window.location.search.includes("t=")) {
      const url = new URL(window.location.href);
      url.pathname = "/ereport/invite/";
      url.searchParams.set("token", tok);
      window.history.replaceState(null, "", url.toString());
    }
    void load(tok);
  }, [load]);

  async function openReport(reportId: string) {
    if (!token) return;
    await load(token, reportId);
  }

  async function onSave() {
    if (!token || !payload || !canEdit) return;
    setSaving(true);
    const res = await saveEreportInviteReport(token, {
      payload,
      reportId: activeReportId || undefined,
      tema,
    });
    setSaving(false);
    if (res.error) setError(res.error);
  }

  return (
    <ProductHubShell title="eReport invite">
      {loading ? <ViewLoading label="Loading invite" /> : null}
      {error ? <p className="ereport-hub__error">{error}</p> : null}
      {expired ? (
        <p className="ereport-hub__error">This invite has expired.</p>
      ) : null}
      {expiresAt && !expired ? (
        <p className="ereport-hub__muted">Edit access until {expiresAt}</p>
      ) : null}

      {scope === "org" && reports.length > 0 && !payload ? (
        <DashboardSection title="Reports in this org">
          <ul className="ereport-hub__reports">
            {reports.map((r) => (
              <li key={r.id}>
                <button type="button" className="btn" onClick={() => void openReport(r.id)}>
                  {r.tema || r.id}
                </button>
              </li>
            ))}
          </ul>
        </DashboardSection>
      ) : null}

      {payload ? (
        <DashboardSection title={tema || "Report"}>
          <p className="ereport-hub__muted">
            Magic-link session{canEdit ? " (editable)" : " (read-only)"}. Full tracker chrome
            opens for owners in the workspace; here you can review JSON payload fields and save
            when edit is allowed.
          </p>
          <label className="ereport-hub__form">
            Tema
            <input
              value={tema}
              onChange={(e) => setTema(e.target.value)}
              disabled={!canEdit || saving}
            />
          </label>
          <label className="ereport-hub__form">
            Payload JSON
            <textarea
              className="ereport-hub__textarea"
              rows={18}
              value={JSON.stringify(payload, null, 2)}
              disabled={!canEdit || saving}
              onChange={(e) => {
                try {
                  setPayload(JSON.parse(e.target.value) as EreportPayload);
                  setError("");
                } catch {
                  setError("Invalid JSON");
                }
              }}
            />
          </label>
          {canEdit ? (
            <button
              type="button"
              className="btn btn--primary"
              disabled={saving}
              onClick={() => void onSave()}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          ) : null}
        </DashboardSection>
      ) : null}
    </ProductHubShell>
  );
}
