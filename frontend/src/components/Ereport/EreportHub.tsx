/**
 * eReport hub — org dashboard (046): orgs, register, recent, manage + invites.
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { checkServiceAccess } from "../../lib/payments";
import { getAuthEmailFromToken } from "../../lib/auth";
import {
  createEreportOrg,
  createOrgEreport,
  createOrgInvite,
  createOrgReportInvite,
  deleteEreportOrg,
  ereportHubPrettyPath,
  fetchEreportOrg,
  fetchEreportOrgs,
  importOrgEreport,
  updateEreportOrgs,
  type OrgCard,
  type RecentReportCard,
  type ReportCard,
} from "../../lib/ereport";
import {
  DashboardGrid,
  DashboardSection,
  ProductHeaderMenu,
  ProductHubShell,
  useProductView,
} from "../ProductDashboard/ProductDashboard";
import "../ProductDashboard/ProductDashboard.css";
import "./Ereport.css";

function emailToSafe(email: string): string {
  return email.trim().toLowerCase().replace(/@/g, "_at_").replace(/\//g, "_");
}

function orgReportHref(userSafe: string, orgId: string, reportId: string): string {
  const q = new URLSearchParams({
    user: userSafe,
    org: orgId,
    report: reportId,
  });
  return `/ereport/workspace?${q.toString()}`;
}

const MENU = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "orgs", label: "Orgs", icon: "corporate_fare" },
  { id: "register", label: "Register", icon: "domain_add" },
  { id: "recent", label: "Recent", icon: "history" },
  { id: "manage", label: "Manage", icon: "folder_managed" },
];

export default function EreportHub() {
  const [view, setView] = useProductView("dashboard");
  const [userSafe, setUserSafe] = useState("");
  const [orgs, setOrgs] = useState<OrgCard[]>([]);
  const [recent, setRecent] = useState<RecentReportCard[]>([]);
  const [activeOrgId, setActiveOrgId] = useState("");
  const [orgName, setOrgName] = useState("");
  const [firstReportName, setFirstReportName] = useState("");
  const [renameOrgId, setRenameOrgId] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [reports, setReports] = useState<ReportCard[]>([]);
  const [tema, setTema] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteHours, setInviteHours] = useState(24);
  const [inviteLink, setInviteLink] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    const access = await checkServiceAccess("ereport");
    setCanCreate(access.allowed);
    const res = await fetchEreportOrgs();
    if (res.error) {
      setError(res.error);
    } else {
      setUserSafe(res.userSafe || emailToSafe(getAuthEmailFromToken() || ""));
      setOrgs(res.orgs);
      setRecent(res.recentReports);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (userSafe && typeof window !== "undefined") {
      const pretty = ereportHubPrettyPath(userSafe);
      if (window.location.pathname.replace(/\/+$/, "") !== pretty) {
        window.history.replaceState(null, "", pretty);
      }
    }
  }, [userSafe]);

  async function openOrg(orgId: string) {
    setActiveOrgId(orgId);
    setView("orgs");
    setBusy(true);
    const res = await fetchEreportOrg(orgId);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setReports(res.reports);
  }

  async function onRegisterOrg(e: FormEvent) {
    e.preventDefault();
    if (busy || !canCreate) return;
    setBusy(true);
    const res = await createEreportOrg(
      orgName.trim() || "New org",
      firstReportName.trim() || "First report",
    );
    setBusy(false);
    if (res.error || !res.org) {
      setError(res.error ?? "Could not create org");
      return;
    }
    setOrgName("");
    setFirstReportName("");
    await reload();
    if (res.report) {
      window.location.href = orgReportHref(
        res.org.ownerSafe,
        res.org.id,
        res.report.id,
      );
      return;
    }
    await openOrg(res.org.id);
  }

  async function onRenameOrg(e: FormEvent) {
    e.preventDefault();
    if (!renameOrgId || !renameValue.trim()) return;
    setBusy(true);
    const res = await updateEreportOrgs([
      { id: renameOrgId, name: renameValue.trim() },
    ]);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setRenameOrgId("");
    setRenameValue("");
    await reload();
  }

  async function onCreateReport(e: FormEvent) {
    e.preventDefault();
    if (busy || !canCreate || !activeOrgId) return;
    setBusy(true);
    const res = await createOrgEreport(activeOrgId, tema.trim() || "Sin tema");
    setBusy(false);
    if (res.error || !res.meta) {
      setError(res.error ?? "Could not create report");
      return;
    }
    window.location.href = orgReportHref(
      res.meta.ownerSafe,
      activeOrgId,
      res.meta.id,
    );
  }

  async function onImportFile(file: File | null) {
    if (!file || busy || !canCreate || !activeOrgId) return;
    if (!/\.ereport$/i.test(file.name)) {
      setError("Solo archivos .ereport");
      return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as Record<string, unknown>;
      if (!Array.isArray(payload.sections)) {
        throw new Error("El .ereport no tiene sections[]");
      }
      const guessed =
        tema.trim() ||
        String(payload.reportNumber || file.name.replace(/\.ereport$/i, "") || "Importado");
      const res = await importOrgEreport(activeOrgId, guessed, payload);
      if (res.error || !res.meta) {
        setError(res.error ?? "Import falló");
        setBusy(false);
        return;
      }
      window.location.href = orgReportHref(
        res.meta.ownerSafe,
        activeOrgId,
        res.meta.id,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import falló");
      setBusy(false);
    }
  }

  async function onInviteOrg(e: FormEvent) {
    e.preventDefault();
    if (!activeOrgId || !inviteEmail.trim()) return;
    setBusy(true);
    const res = await createOrgInvite(
      activeOrgId,
      inviteEmail.trim(),
      Math.max(1, inviteHours),
    );
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setInviteLink(res.link);
  }

  async function onInviteReport(reportId: string) {
    const email = window.prompt("Invite email (magic link, 1 hour edit):");
    if (!email || !activeOrgId) return;
    setBusy(true);
    const res = await createOrgReportInvite(activeOrgId, reportId, email.trim());
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setInviteLink(res.link);
    window.alert(`Invite link:\n${res.link}`);
  }

  async function toggleHide(org: OrgCard) {
    setBusy(true);
    await updateEreportOrgs([{ id: org.id, hidden: !org.hidden, order: org.order }]);
    setBusy(false);
    await reload();
  }

  async function moveOrg(org: OrgCard, dir: -1 | 1) {
    const visible = [...orgs].sort((a, b) => a.order - b.order);
    const idx = visible.findIndex((o) => o.id === org.id);
    const swap = visible[idx + dir];
    if (!swap) return;
    setBusy(true);
    await updateEreportOrgs([
      { id: org.id, order: swap.order, hidden: org.hidden },
      { id: swap.id, order: org.order, hidden: swap.hidden },
    ]);
    setBusy(false);
    await reload();
  }

  async function onDeleteOrg(orgId: string) {
    if (!window.confirm("Delete this org and its reports?")) return;
    setBusy(true);
    const res = await deleteEreportOrg(orgId);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (activeOrgId === orgId) {
      setActiveOrgId("");
      setReports([]);
    }
    await reload();
    setView("manage");
  }

  const visibleOrgs = orgs.filter((o) => !o.hidden);

  return (
    <>
      <ProductHeaderMenu
        menuId="ereport-hub-menu"
        items={MENU}
        activeId={view}
        onSelect={(id) => {
          setView(id);
          if (id !== "orgs") setInviteLink("");
        }}
      />
      <ProductHubShell title="eReport">
        {view !== "dashboard" ? (
          <p className="ereport-hub__back">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setView("dashboard");
                setInviteLink("");
              }}
            >
              Back to dashboard
            </button>
          </p>
        ) : null}
        {error ? <p className="ereport-hub__error">{error}</p> : null}
        {loading ? <p className="ereport-hub__muted">Loading…</p> : null}

        {view === "dashboard" ? (
          <>
            <DashboardSection title="Orgs">
              <DashboardGrid
                cards={[
                  {
                    id: "orgs",
                    title: "Orgs",
                    description: `${visibleOrgs.length} visible`,
                    icon: "corporate_fare",
                  },
                  {
                    id: "register",
                    title: "Register org",
                    description: "Create a client organization",
                    icon: "domain_add",
                  },
                ]}
                onSelect={setView}
              />
            </DashboardSection>
            <DashboardSection title="Reports">
              <DashboardGrid
                cards={[
                  {
                    id: "recent",
                    title: "Recent reports",
                    description: `${recent.length} recent`,
                    icon: "history",
                  },
                  {
                    id: "manage",
                    title: "Manage orgs",
                    description: "Order, hide, delete",
                    icon: "folder_managed",
                  },
                ]}
                onSelect={setView}
              />
            </DashboardSection>
          </>
        ) : null}

        {view === "register" ? (
          <DashboardSection title="Register org">
            <form className="ereport-hub__form" onSubmit={onRegisterOrg}>
              <label>
                Organization name
                <input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Client / project org"
                  required
                  disabled={!canCreate || busy}
                />
              </label>
              <label>
                First report name
                <input
                  value={firstReportName}
                  onChange={(e) => setFirstReportName(e.target.value)}
                  placeholder="e.g. Model QA — Sprint 1"
                  required
                  disabled={!canCreate || busy}
                />
              </label>
              <button
                type="submit"
                className="btn btn--primary"
                disabled={!canCreate || busy}
              >
                Create org + first report
              </button>
              {!canCreate ? (
                <p className="ereport-hub__muted">eReport subscription required.</p>
              ) : null}
            </form>
          </DashboardSection>
        ) : null}

        {view === "orgs" ? (
          <DashboardSection title="Orgs">
            <div className="ereport-hub__org-list">
              {visibleOrgs.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={
                    o.id === activeOrgId
                      ? "product-dash__card product-dash__card--active"
                      : "product-dash__card"
                  }
                  onClick={() => void openOrg(o.id)}
                >
                  <span className="product-dash__card-title">{o.name}</span>
                  <span className="product-dash__card-desc">Open reports</span>
                </button>
              ))}
              {visibleOrgs.length === 0 ? (
                <p className="ereport-hub__muted">No orgs yet — register one.</p>
              ) : null}
            </div>

            {activeOrgId ? (
              <div className="ereport-hub__org-panel">
                <h3 className="ereport-hub__subhead">Organization</h3>
                <form
                  className="ereport-hub__form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const o = orgs.find((x) => x.id === activeOrgId);
                    if (!o) return;
                    setRenameOrgId(activeOrgId);
                    setRenameValue(o.name);
                    void onRenameOrg(e);
                  }}
                >
                  <label>
                    Org name
                    <input
                      value={
                        renameOrgId === activeOrgId
                          ? renameValue
                          : orgs.find((x) => x.id === activeOrgId)?.name || ""
                      }
                      onFocus={() => {
                        const o = orgs.find((x) => x.id === activeOrgId);
                        setRenameOrgId(activeOrgId);
                        setRenameValue(o?.name ?? "");
                      }}
                      onChange={(e) => {
                        setRenameOrgId(activeOrgId);
                        setRenameValue(e.target.value);
                      }}
                      disabled={busy}
                    />
                  </label>
                  <button
                    type="submit"
                    className="btn"
                    disabled={busy || !renameValue.trim()}
                  >
                    Save org name
                  </button>
                </form>

                <h3 className="ereport-hub__subhead">Reports</h3>
                <form className="ereport-hub__form" onSubmit={onCreateReport}>
                  <label>
                    Report name
                    <input
                      value={tema}
                      onChange={(e) => setTema(e.target.value)}
                      placeholder="Report name / tema"
                      disabled={!canCreate || busy}
                    />
                  </label>
                  <div className="ereport-hub__row">
                    <button
                      type="submit"
                      className="btn btn--primary"
                      disabled={!canCreate || busy}
                    >
                      New report
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={!canCreate || busy}
                      onClick={() => fileRef.current?.click()}
                    >
                      Import .ereport
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".ereport,application/json"
                      hidden
                      onChange={(e) => void onImportFile(e.target.files?.[0] ?? null)}
                    />
                  </div>
                </form>

                <ul className="ereport-hub__reports">
                  {reports.map((r) => (
                    <li key={r.id}>
                      <a href={orgReportHref(userSafe, activeOrgId, r.id)}>
                        {r.tema || r.id}
                      </a>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => void onInviteReport(r.id)}
                      >
                        Invite
                      </button>
                    </li>
                  ))}
                </ul>

                <h3 className="ereport-hub__subhead">Invite to org list</h3>
                <form className="ereport-hub__form" onSubmit={onInviteOrg}>
                  <label>
                    Email
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Duration (hours)
                    <input
                      type="number"
                      min={1}
                      value={inviteHours}
                      onChange={(e) => setInviteHours(Number(e.target.value) || 1)}
                    />
                  </label>
                  <button type="submit" className="btn btn--primary" disabled={busy}>
                    Send magic link
                  </button>
                </form>
                {inviteLink ? (
                  <p className="ereport-hub__link">
                    Link: <a href={inviteLink}>{inviteLink}</a>
                  </p>
                ) : null}
              </div>
            ) : null}
          </DashboardSection>
        ) : null}

        {view === "recent" ? (
          <DashboardSection title="Recent reports">
            <ul className="ereport-hub__reports">
              {recent.map((r) => (
                <li key={`${r.orgId}-${r.id}`}>
                  <a href={orgReportHref(userSafe, r.orgId, r.id)}>
                    {r.tema || r.id}
                    {r.orgName ? ` · ${r.orgName}` : ""}
                  </a>
                </li>
              ))}
              {recent.length === 0 ? (
                <p className="ereport-hub__muted">No recent org reports yet.</p>
              ) : null}
            </ul>
          </DashboardSection>
        ) : null}

        {view === "manage" ? (
          <DashboardSection title="Manage orgs">
            <form className="ereport-hub__form" onSubmit={onRenameOrg}>
              <label>
                Rename org
                <select
                  value={renameOrgId}
                  onChange={(e) => {
                    setRenameOrgId(e.target.value);
                    const o = orgs.find((x) => x.id === e.target.value);
                    setRenameValue(o?.name ?? "");
                  }}
                >
                  <option value="">Select org…</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                New name
                <input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  disabled={!renameOrgId || busy}
                />
              </label>
              <button
                type="submit"
                className="btn btn--primary"
                disabled={!renameOrgId || !renameValue.trim() || busy}
              >
                Save name
              </button>
            </form>
            <ul className="ereport-hub__manage">
              {[...orgs]
                .sort((a, b) => a.order - b.order)
                .map((o) => (
                  <li key={o.id}>
                    <strong>
                      {o.name}
                      {o.hidden ? " (hidden)" : ""}
                    </strong>
                    <div className="ereport-hub__row">
                      <button type="button" className="btn" onClick={() => void moveOrg(o, -1)}>
                        Up
                      </button>
                      <button type="button" className="btn" onClick={() => void moveOrg(o, 1)}>
                        Down
                      </button>
                      <button type="button" className="btn" onClick={() => void toggleHide(o)}>
                        {o.hidden ? "Show" : "Hide"}
                      </button>
                      <button
                        type="button"
                        className="btn btn--danger"
                        onClick={() => void onDeleteOrg(o.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
            </ul>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => setView("register")}
            >
              New org
            </button>
          </DashboardSection>
        ) : null}
      </ProductHubShell>
    </>
  );
}
