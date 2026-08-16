/**
 * APS admin panel (allowlisted email):
 * 1) Trigger Design Automation workitem + poll
 * 2) Registry: app bundles / activities / engines
 * 3) Hub explorer: hubs → projects → folder contents (folderId required)
 *
 * Registry note: Autodesk DA list endpoints return { data: [], pagination }.
 * Always normalize via normalizeRegistryLists / unwrapList before .map —
 * a non-array .map throws and React blanks the entire admin UI.
 */

import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from "react";
import { APP_ROUTES, APS_ROUTES } from "../../config/routes";
import {
  APS_ADMIN_EMAIL,
  getAuthEmailFromToken,
  getAuthToken,
  isApsAdminEmail,
  isAuthenticated,
} from "../../lib/auth";
import { apiRequest, formatApiError, type ApiError } from "../../lib/api";
import { createCorrelationId } from "../../lib/correlation";
import {
  normalizeRegistryLists,
  unwrapList,
  type RegistryPayload,
} from "../../lib/apsRegistry";
import { openApiErrorModal } from "../ServerErrorModal/ServerErrorModal";
import "./ApsAdminPage.css";

const APS_ADMIN_EMAIL_DISPLAY = APS_ADMIN_EMAIL;
const DEFAULT_INPUT_KEY = "singleRoom.rvt";
const POLL_MS = 4000;
const MAX_POLLS = 180;

type TriggerResponse = {
  workItemId?: string;
  outputObjectKey?: string;
  message?: string;
};

type StatusResponse = {
  status?: string;
  done?: boolean;
  message?: string;
  extractedData?: unknown;
  workItemStatus?: unknown;
};

type HubItem = {
  id?: string;
  name?: string;
  attributes?: { name?: string };
};

type ProjectItem = {
  id?: string;
  name?: string;
  attributes?: { name?: string };
};

type ContentItem = {
  id?: string;
  type?: string;
  name?: string;
  attributes?: {
    name?: string;
    displayName?: string;
    extension?: { type?: string };
  };
};

type ApsRenderGuardProps = {
  children: ReactNode;
  label: string;
};

type ApsRenderGuardState = {
  failed: boolean;
};

/**
 * Keeps page chrome mounted if a child section throws during render
 * (e.g. unexpected registry shape). Surfaces details via ServerErrorModal.
 */
class ApsRenderGuard extends Component<ApsRenderGuardProps, ApsRenderGuardState> {
  state: ApsRenderGuardState = { failed: false };

  static getDerivedStateFromError(): ApsRenderGuardState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const details = [
      `APS admin render failed (${this.props.label}).`,
      error?.message || String(error),
      info?.componentStack || "",
    ]
      .filter(Boolean)
      .join("\n");
    openApiErrorModal(details, {
      title: "APS UI render error",
      summary: "A section failed to render. The rest of the page stays available.",
    });
  }

  render() {
    if (this.state.failed) {
      return (
        <p className="aps-admin__error" role="alert">
          This section failed to render. Use the error modal to copy details, then retry.
        </p>
      );
    }
    return this.props.children;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatApsError(error: ApiError): string {
  if (error.status === 503) {
    return [
      "APS not configured (HTTP 503).",
      "Set APS_CLIENT_ID, APS_CLIENT_SECRET, and APS_ACTIVITY_ID on the Next backend, then retry.",
      error.message,
      formatApiError(error),
    ]
      .filter(Boolean)
      .join("\n");
  }
  return formatApiError(error);
}

function reportApsError(details: string, summary?: string): void {
  openApiErrorModal(details, {
    title: "APS server error",
    summary: summary ?? "The APS API call failed. Copy the block below for debugging.",
  });
}

function resolveApsAccess(): {
  authorized: boolean;
  email: string | null;
  needsLogin: boolean;
} {
  if (!isAuthenticated()) {
    return { authorized: false, email: null, needsLogin: true };
  }
  const email = getAuthEmailFromToken();
  return {
    authorized: isApsAdminEmail(email),
    email,
    needsLogin: false,
  };
}

function itemName(item: {
  name?: string;
  attributes?: { name?: string; displayName?: string };
}) {
  return (
    item.name ||
    item.attributes?.displayName ||
    item.attributes?.name ||
    item.id ||
    "(unnamed)"
  );
}

export default function ApsAdminPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [accessEmail, setAccessEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusLabel, setStatusLabel] = useState("");
  const [payload, setPayload] = useState<unknown>(null);
  const [error, setError] = useState("");

  const [registryLoading, setRegistryLoading] = useState(false);
  const [registryError, setRegistryError] = useState("");
  const [registry, setRegistry] = useState<RegistryPayload | null>(null);

  const [hubs, setHubs] = useState<HubItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [selectedHubId, setSelectedHubId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [folderIdInput, setFolderIdInput] = useState("");
  const [folderStack, setFolderStack] = useState<Array<{ id: string; name: string }>>([]);
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [explorerError, setExplorerError] = useState("");

  useEffect(() => {
    let cancelled = false;

    function applyAccess() {
      const access = resolveApsAccess();
      if (cancelled) return;
      setAccessEmail(access.email);
      // Always leave the null/"Checking access…" state — never hang here.
      setAuthorized(access.authorized);
      if (access.needsLogin) {
        window.location.replace(
          `${APP_ROUTES.login}?next=${encodeURIComponent(APP_ROUTES.apsAdmin)}`,
        );
      }
    }

    applyAccess();
    document.addEventListener("astro:page-load", applyAccess);
    // Safety net: if something prevents the first apply, unlock the UI.
    const unlock = window.setTimeout(() => {
      setAuthorized((prev) => (prev === null ? false : prev));
    }, 1500);

    return () => {
      cancelled = true;
      document.removeEventListener("astro:page-load", applyAccess);
      window.clearTimeout(unlock);
    };
  }, []);

  async function handleTrigger() {
    setLoading(true);
    setError("");
    setPayload(null);
    setStatusLabel("Submitting WorkItem…");
    const authToken = getAuthToken();

    const submitted = await apiRequest<TriggerResponse>(APS_ROUTES.triggerWorkItem, {
      method: "POST",
      body: { inputObjectKey: DEFAULT_INPUT_KEY },
      correlationId: createCorrelationId(),
      authToken,
    });

    if (submitted.error || !submitted.data?.workItemId) {
      const detail = submitted.error
        ? formatApsError(submitted.error)
        : "WorkItem submit failed — no workItemId in response";
      setError(detail);
      reportApsError(detail, "WorkItem submit failed.");
      setPayload({ error: submitted.error, data: submitted.data ?? null });
      setLoading(false);
      setStatusLabel("");
      return;
    }

    const workItemId = submitted.data.workItemId;
    const outputObjectKey = submitted.data.outputObjectKey ?? "";
    setPayload(submitted.data);
    setStatusLabel(`Submitted ${workItemId}; polling APS…`);

    for (let i = 0; i < MAX_POLLS; i++) {
      await sleep(POLL_MS);
      const statusRes = await apiRequest<StatusResponse>(
        APS_ROUTES.workItemStatus(workItemId, outputObjectKey),
        {
          method: "GET",
          correlationId: createCorrelationId(),
          authToken,
        },
      );

      if (statusRes.error) {
        const detail = formatApsError(statusRes.error);
        setError(detail);
        reportApsError(detail, "WorkItem status poll failed.");
        setPayload({ error: statusRes.error, data: statusRes.data ?? null });
        setLoading(false);
        setStatusLabel("");
        return;
      }

      const body = statusRes.data;
      setPayload(body ?? null);
      setStatusLabel(`APS status: ${body?.status ?? "unknown"}`);

      if (body?.done) {
        setLoading(false);
        setStatusLabel(body.message ?? "Done");
        return;
      }
    }

    setError("Timed out waiting for APS WorkItem (client poll limit)");
    reportApsError(
      "Timed out waiting for APS WorkItem (client poll limit)",
      "WorkItem polling stopped.",
    );
    setLoading(false);
    setStatusLabel("");
  }

  async function loadRegistry() {
    setRegistryLoading(true);
    setRegistryError("");
    try {
      const res = await apiRequest<RegistryPayload>(APS_ROUTES.registry, {
        method: "GET",
        correlationId: createCorrelationId(),
        authToken: getAuthToken(),
      });
      if (res.error) {
        const detail = formatApsError(res.error);
        setRegistryError(detail);
        reportApsError(detail, "DA registry request failed.");
        // Keep prior registry data so chrome/lists stay visible on retry failures.
        return;
      }
      setRegistry(res.data ?? null);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setRegistryError(detail);
      reportApsError(detail, "DA registry request failed unexpectedly.");
    } finally {
      setRegistryLoading(false);
    }
  }

  async function loadHubs() {
    setExplorerLoading(true);
    setExplorerError("");
    setProjects([]);
    setContents([]);
    setSelectedHubId("");
    setSelectedProjectId("");
    setFolderStack([]);
    setFolderIdInput("");
    try {
      const res = await apiRequest<unknown>(APS_ROUTES.hubs, {
        method: "GET",
        correlationId: createCorrelationId(),
        authToken: getAuthToken(),
      });
      if (res.error) {
        const detail = formatApsError(res.error);
        setExplorerError(detail);
        reportApsError(detail, "Hub list failed.");
        setHubs([]);
      } else {
        setHubs(unwrapList<HubItem>(res.data));
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setExplorerError(detail);
      reportApsError(detail, "Hub list failed unexpectedly.");
      setHubs([]);
    } finally {
      setExplorerLoading(false);
    }
  }

  async function loadProjects(hubId: string) {
    setExplorerLoading(true);
    setExplorerError("");
    setSelectedHubId(hubId);
    setSelectedProjectId("");
    setContents([]);
    setFolderStack([]);
    setFolderIdInput("");
    try {
      const res = await apiRequest<unknown>(APS_ROUTES.projects(hubId), {
        method: "GET",
        correlationId: createCorrelationId(),
        authToken: getAuthToken(),
      });
      if (res.error) {
        const detail = formatApsError(res.error);
        setExplorerError(detail);
        reportApsError(detail, "Project list failed.");
        setProjects([]);
      } else {
        setProjects(unwrapList<ProjectItem>(res.data));
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setExplorerError(detail);
      reportApsError(detail, "Project list failed unexpectedly.");
      setProjects([]);
    } finally {
      setExplorerLoading(false);
    }
  }

  async function loadContents(projectId: string, folderId: string) {
    const trimmed = folderId.trim();
    if (!trimmed) {
      setExplorerError(
        "folderId is required. Paste a Data Management folder URN, then load contents.",
      );
      return;
    }
    setExplorerLoading(true);
    setExplorerError("");
    setSelectedProjectId(projectId);
    try {
      const res = await apiRequest<unknown>(APS_ROUTES.contents(projectId, trimmed), {
        method: "GET",
        correlationId: createCorrelationId(),
        authToken: getAuthToken(),
      });
      if (res.error) {
        const detail = formatApsError(res.error);
        setExplorerError(detail);
        reportApsError(detail, "Folder contents request failed.");
        setContents([]);
      } else {
        setContents(unwrapList<ContentItem>(res.data));
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setExplorerError(detail);
      reportApsError(detail, "Folder contents request failed unexpectedly.");
      setContents([]);
    } finally {
      setExplorerLoading(false);
    }
  }

  function openFolder(item: ContentItem) {
    if (!selectedProjectId || !item.id) return;
    const name = itemName(item);
    setFolderStack((stack) => [...stack, { id: item.id!, name }]);
    setFolderIdInput(item.id);
    void loadContents(selectedProjectId, item.id);
  }

  function goToFolderDepth(depth: number) {
    if (!selectedProjectId) return;
    if (depth < 0) {
      setFolderStack([]);
      if (folderIdInput.trim()) {
        void loadContents(selectedProjectId, folderIdInput);
      }
      return;
    }
    const next = folderStack.slice(0, depth + 1);
    setFolderStack(next);
    const folderId = next[next.length - 1]?.id ?? "";
    setFolderIdInput(folderId);
    void loadContents(selectedProjectId, folderId);
  }

  function isFolder(item: ContentItem): boolean {
    const t = (item.type || item.attributes?.extension?.type || "").toLowerCase();
    return t.includes("folder");
  }

  if (authorized === null) {
    return <p className="aps-admin__status">Checking access…</p>;
  }

  if (!authorized) {
    return (
      <section className="aps-admin aps-admin--denied" aria-labelledby="aps-denied-title">
        <h1 id="aps-denied-title" className="aps-admin__title">
          Unauthorized
        </h1>
        <p className="aps-admin__lead">
          This page is restricted to the APS admin allowlist
          (<code>{APS_ADMIN_EMAIL_DISPLAY}</code>).
          {accessEmail ? (
            <>
              {" "}
              Signed in as <code>{accessEmail}</code>.
            </>
          ) : (
            <> Sign in with the admin account to continue.</>
          )}
        </p>
        <p className="aps-admin__lead">
          <a href={APP_ROUTES.login}>Go to login</a>
        </p>
      </section>
    );
  }

  const { bundles, activities, engines } = normalizeRegistryLists(registry);

  return (
    <section className="aps-admin" aria-labelledby="aps-admin-title">
      <h1 id="aps-admin-title" className="aps-admin__title">
        APS Design Automation
      </h1>
      <p className="aps-admin__lead">
        Trigger Revit Design Automation, inspect the DA registry, and browse ACC/BIM 360 hubs.
        Without APS credentials the Next backend returns <strong>HTTP 503</strong> with a clear
        message — that is expected until env vars are set.
      </p>

      <div className="aps-admin__section">
        <h2 className="aps-admin__section-title">Trigger workitem</h2>
        <p className="aps-admin__lead">
          Submits activity work against <code>{DEFAULT_INPUT_KEY}</code> when credentials exist.
        </p>
        <button
          type="button"
          className="btn btn--primary"
          disabled={loading}
          onClick={() => void handleTrigger()}
        >
          {loading ? "Running extraction…" : "Extract model data"}
        </button>
        {loading || statusLabel ? (
          <p className="aps-admin__status">
            {statusLabel ||
              "Waiting for Autodesk Design Automation (can take several minutes)…"}
          </p>
        ) : null}
        {error ? <p className="aps-admin__error" role="alert">{error}</p> : null}
        {payload !== null ? (
          <pre className="aps-admin__payload" tabIndex={0}>
            {JSON.stringify(payload, null, 2)}
          </pre>
        ) : null}
      </div>

      <div className="aps-admin__section">
        <h2 className="aps-admin__section-title">DA registry</h2>
        <p className="aps-admin__lead">
          Lists app bundles, activities, and engines from <code>GET /api/aps/registry</code>.
        </p>
        <button
          type="button"
          className="btn"
          disabled={registryLoading}
          onClick={() => void loadRegistry()}
        >
          {registryLoading ? "Loading registry…" : "Fetch registry"}
        </button>
        {registryError ? (
          <p className="aps-admin__error" role="alert">
            {registryError}
          </p>
        ) : null}
        <ApsRenderGuard label="DA registry">
          {registry ? (
            <div className="aps-admin__registry-grid">
              <div>
                <h3 className="aps-admin__subhead">Bundles ({bundles.length})</h3>
                <ul className="aps-admin__list">
                  {bundles.length === 0 ? (
                    <li className="aps-admin__muted">None returned</li>
                  ) : null}
                  {bundles.map((b, i) => (
                    <li key={`bundle-${i}`}>
                      <code>{typeof b === "string" ? b : JSON.stringify(b)}</code>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="aps-admin__subhead">Activities ({activities.length})</h3>
                <ul className="aps-admin__list">
                  {activities.length === 0 ? (
                    <li className="aps-admin__muted">None returned</li>
                  ) : null}
                  {activities.map((a, i) => (
                    <li key={`activity-${i}`}>
                      <code>{typeof a === "string" ? a : JSON.stringify(a)}</code>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="aps-admin__subhead">Engines ({engines.length})</h3>
                <ul className="aps-admin__list">
                  {engines.length === 0 ? (
                    <li className="aps-admin__muted">None returned</li>
                  ) : null}
                  {engines.map((e, i) => (
                    <li key={`engine-${i}`}>
                      <code>{typeof e === "string" ? e : JSON.stringify(e)}</code>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </ApsRenderGuard>
      </div>

      <div className="aps-admin__section">
        <h2 className="aps-admin__section-title">Hub explorer</h2>
        <p className="aps-admin__lead">
          Click hubs → projects, then provide a <code>folderId</code> URN to list contents
          (<code>GET /api/aps/projects/…/contents?folderId=</code>).
        </p>
        <button
          type="button"
          className="btn"
          disabled={explorerLoading}
          onClick={() => void loadHubs()}
        >
          {explorerLoading ? "Loading…" : "Load hubs"}
        </button>
        {explorerError ? (
          <p className="aps-admin__error" role="alert">
            {explorerError}
          </p>
        ) : null}

        <ApsRenderGuard label="Hub explorer">
          <div className="aps-admin__explorer">
            <div className="aps-admin__explorer-col">
              <h3 className="aps-admin__subhead">Hubs</h3>
              <ul className="aps-admin__list aps-admin__list--clickable">
                {hubs.length === 0 ? (
                  <li className="aps-admin__muted">No hubs loaded</li>
                ) : (
                  hubs.map((hub) => {
                    const id = hub.id ?? "";
                    return (
                      <li key={id || itemName(hub)}>
                        <button
                          type="button"
                          className={`aps-admin__tree-btn${selectedHubId === id ? " is-active" : ""}`}
                          disabled={!id || explorerLoading}
                          onClick={() => void loadProjects(id)}
                        >
                          {itemName(hub)}
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>

            <div className="aps-admin__explorer-col">
              <h3 className="aps-admin__subhead">Projects</h3>
              <ul className="aps-admin__list aps-admin__list--clickable">
                {!selectedHubId ? (
                  <li className="aps-admin__muted">Select a hub</li>
                ) : projects.length === 0 ? (
                  <li className="aps-admin__muted">No projects</li>
                ) : (
                  projects.map((project) => {
                    const id = project.id ?? "";
                    return (
                      <li key={id || itemName(project)}>
                        <button
                          type="button"
                          className={`aps-admin__tree-btn${
                            selectedProjectId === id ? " is-active" : ""
                          }`}
                          disabled={!id || explorerLoading}
                          onClick={() => {
                            setFolderStack([]);
                            setContents([]);
                            setSelectedProjectId(id);
                            setFolderIdInput("");
                            setExplorerError(
                              "Enter a folderId URN below, then load contents for this project.",
                            );
                          }}
                        >
                          {itemName(project)}
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>

            <div className="aps-admin__explorer-col">
              <h3 className="aps-admin__subhead">Contents</h3>
              {selectedProjectId ? (
                <div className="aps-admin__folder-form">
                  <label htmlFor="aps-folder-id">folderId</label>
                  <input
                    id="aps-folder-id"
                    value={folderIdInput}
                    onChange={(e) => setFolderIdInput(e.target.value)}
                    placeholder="urn:adsk.wipprod:fs.folder:…"
                    disabled={explorerLoading}
                  />
                  <button
                    type="button"
                    className="btn"
                    disabled={explorerLoading || !folderIdInput.trim()}
                    onClick={() => {
                      setFolderStack([]);
                      void loadContents(selectedProjectId, folderIdInput);
                    }}
                  >
                    Load folder
                  </button>
                </div>
              ) : null}
              {selectedProjectId && folderStack.length > 0 ? (
                <nav className="aps-admin__crumbs" aria-label="Folder path">
                  {folderStack.map((folder, index) => (
                    <button
                      key={folder.id}
                      type="button"
                      className="aps-admin__crumb"
                      onClick={() => goToFolderDepth(index)}
                    >
                      {index === 0 ? folder.name : `/ ${folder.name}`}
                    </button>
                  ))}
                </nav>
              ) : null}
              <ul className="aps-admin__list aps-admin__list--clickable">
                {!selectedProjectId ? (
                  <li className="aps-admin__muted">Select a project</li>
                ) : contents.length === 0 ? (
                  <li className="aps-admin__muted">Empty / not loaded</li>
                ) : (
                  contents.map((item) => {
                    const folder = isFolder(item);
                    return (
                      <li key={item.id || itemName(item)}>
                        {folder ? (
                          <button
                            type="button"
                            className="aps-admin__tree-btn"
                            disabled={explorerLoading}
                            onClick={() => openFolder(item)}
                          >
                            [folder] {itemName(item)}
                          </button>
                        ) : (
                          <span className="aps-admin__file">[file] {itemName(item)}</span>
                        )}
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          </div>
        </ApsRenderGuard>
      </div>
    </section>
  );
}
