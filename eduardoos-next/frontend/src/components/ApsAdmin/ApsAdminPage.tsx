/**
 * APS admin panel (allowlisted email):
 * 1) Trigger Design Automation workitem + poll
 * 2) Registry: app bundles / activities / engines
 * 3) Hub explorer: hubs → projects → folder contents
 */

import { useEffect, useState } from "react";
import { APP_ROUTES, APS_ROUTES } from "../../config/routes";
import {
  getAuthEmailFromToken,
  getAuthToken,
  isApsAdminEmail,
  isAuthenticated,
} from "../../lib/auth";
import { apiRequest, formatApiError } from "../../lib/api";
import { createCorrelationId } from "../../lib/correlation";
import "./ApsAdminPage.css";

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

type RegistryResponse = {
  bundles?: unknown[];
  appbundles?: unknown[];
  activities?: unknown[];
  engines?: unknown[];
  message?: string;
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

type ListResponse<T> = {
  data?: T[];
  items?: T[];
  message?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function itemName(item: { name?: string; attributes?: { name?: string; displayName?: string } }) {
  return (
    item.name ||
    item.attributes?.displayName ||
    item.attributes?.name ||
    item.id ||
    "(unnamed)"
  );
}

function unwrapList<T>(payload: ListResponse<T> | undefined): T[] {
  if (!payload) return [];
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

export default function ApsAdminPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusLabel, setStatusLabel] = useState("");
  const [payload, setPayload] = useState<unknown>(null);
  const [error, setError] = useState("");

  const [registryLoading, setRegistryLoading] = useState(false);
  const [registryError, setRegistryError] = useState("");
  const [registry, setRegistry] = useState<RegistryResponse | null>(null);

  const [hubs, setHubs] = useState<HubItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [selectedHubId, setSelectedHubId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [folderStack, setFolderStack] = useState<Array<{ id: string; name: string }>>([]);
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [explorerError, setExplorerError] = useState("");

  useEffect(() => {
    if (!isAuthenticated()) {
      window.location.replace(
        `${APP_ROUTES.login}?next=${encodeURIComponent(APP_ROUTES.apsAdmin)}`,
      );
      return;
    }
    setAuthorized(isApsAdminEmail(getAuthEmailFromToken()));
  }, []);

  async function handleTrigger() {
    setLoading(true);
    setError("");
    setPayload(null);
    setStatusLabel("Submitting WorkItem…");
    const authToken = getAuthToken();
    const correlationId = createCorrelationId();

    const submitted = await apiRequest<TriggerResponse>(APS_ROUTES.triggerWorkItem, {
      method: "POST",
      body: { inputObjectKey: DEFAULT_INPUT_KEY },
      correlationId,
      authToken,
    });

    if (submitted.error || !submitted.data?.workItemId) {
      const detail = submitted.error
        ? formatApiError(submitted.error)
        : "WorkItem submit failed";
      setError(detail);
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
        setError(formatApiError(statusRes.error));
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
    setLoading(false);
    setStatusLabel("");
  }

  async function loadRegistry() {
    setRegistryLoading(true);
    setRegistryError("");
    const authToken = getAuthToken();
    const res = await apiRequest<RegistryResponse>(APS_ROUTES.registry, {
      method: "GET",
      correlationId: createCorrelationId(),
      authToken,
    });
    if (res.error) {
      setRegistryError(formatApiError(res.error));
      setRegistry(null);
    } else {
      setRegistry(res.data ?? null);
    }
    setRegistryLoading(false);
  }

  async function loadHubs() {
    setExplorerLoading(true);
    setExplorerError("");
    setProjects([]);
    setContents([]);
    setSelectedHubId("");
    setSelectedProjectId("");
    setFolderStack([]);
    const authToken = getAuthToken();
    const res = await apiRequest<ListResponse<HubItem>>(APS_ROUTES.hubs, {
      method: "GET",
      correlationId: createCorrelationId(),
      authToken,
    });
    if (res.error) {
      setExplorerError(formatApiError(res.error));
      setHubs([]);
    } else {
      setHubs(unwrapList(res.data));
    }
    setExplorerLoading(false);
  }

  async function loadProjects(hubId: string) {
    setExplorerLoading(true);
    setExplorerError("");
    setSelectedHubId(hubId);
    setSelectedProjectId("");
    setContents([]);
    setFolderStack([]);
    const authToken = getAuthToken();
    const res = await apiRequest<ListResponse<ProjectItem>>(APS_ROUTES.projects(hubId), {
      method: "GET",
      correlationId: createCorrelationId(),
      authToken,
    });
    if (res.error) {
      setExplorerError(formatApiError(res.error));
      setProjects([]);
    } else {
      setProjects(unwrapList(res.data));
    }
    setExplorerLoading(false);
  }

  async function loadContents(hubId: string, projectId: string, folderId?: string) {
    setExplorerLoading(true);
    setExplorerError("");
    setSelectedProjectId(projectId);
    const authToken = getAuthToken();
    const res = await apiRequest<ListResponse<ContentItem>>(
      APS_ROUTES.contents(hubId, projectId, folderId),
      {
        method: "GET",
        correlationId: createCorrelationId(),
        authToken,
      },
    );
    if (res.error) {
      setExplorerError(formatApiError(res.error));
      setContents([]);
    } else {
      setContents(unwrapList(res.data));
    }
    setExplorerLoading(false);
  }

  function openFolder(item: ContentItem) {
    if (!selectedHubId || !selectedProjectId || !item.id) return;
    const name = itemName(item);
    setFolderStack((stack) => [...stack, { id: item.id!, name }]);
    void loadContents(selectedHubId, selectedProjectId, item.id);
  }

  function goToFolderDepth(depth: number) {
    if (!selectedHubId || !selectedProjectId) return;
    if (depth < 0) {
      setFolderStack([]);
      void loadContents(selectedHubId, selectedProjectId);
      return;
    }
    const next = folderStack.slice(0, depth + 1);
    setFolderStack(next);
    const folderId = next[next.length - 1]?.id;
    void loadContents(selectedHubId, selectedProjectId, folderId);
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
          This page is restricted. Your account does not have access.
        </p>
      </section>
    );
  }

  const bundles = registry?.bundles ?? registry?.appbundles ?? [];
  const activities = registry?.activities ?? [];
  const engines = registry?.engines ?? [];

  return (
    <section className="aps-admin" aria-labelledby="aps-admin-title">
      <h1 id="aps-admin-title" className="aps-admin__title">
        APS Design Automation
      </h1>
      <p className="aps-admin__lead">
        Trigger Revit Design Automation, inspect the DA registry, and browse ACC/BIM 360 hubs
        so you can see how Autodesk Platform Services is wired.
      </p>

      <div className="aps-admin__section">
        <h2 className="aps-admin__section-title">Trigger workitem</h2>
        <p className="aps-admin__lead">
          Runs extraction on <code>{DEFAULT_INPUT_KEY}</code> in bucket <code>aps20250806</code>.
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
        {error ? <p className="aps-admin__error">{error}</p> : null}
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
        {registryError ? <p className="aps-admin__error">{registryError}</p> : null}
        {registry ? (
          <div className="aps-admin__registry-grid">
            <div>
              <h3 className="aps-admin__subhead">Bundles ({bundles.length})</h3>
              <ul className="aps-admin__list">
                {bundles.length === 0 ? <li className="aps-admin__muted">None returned</li> : null}
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
                {engines.length === 0 ? <li className="aps-admin__muted">None returned</li> : null}
                {engines.map((e, i) => (
                  <li key={`engine-${i}`}>
                    <code>{typeof e === "string" ? e : JSON.stringify(e)}</code>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </div>

      <div className="aps-admin__section">
        <h2 className="aps-admin__section-title">Hub explorer</h2>
        <p className="aps-admin__lead">
          Click hubs → projects → folders/files to understand the Data Management tree.
        </p>
        <button
          type="button"
          className="btn"
          disabled={explorerLoading}
          onClick={() => void loadHubs()}
        >
          {explorerLoading ? "Loading…" : "Load hubs"}
        </button>
        {explorerError ? <p className="aps-admin__error">{explorerError}</p> : null}

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
                          void loadContents(selectedHubId, id);
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
              <nav className="aps-admin__crumbs" aria-label="Folder path">
                <button
                  type="button"
                  className="aps-admin__crumb"
                  onClick={() => goToFolderDepth(-1)}
                >
                  Root
                </button>
                {folderStack.map((folder, index) => (
                  <button
                    key={folder.id}
                    type="button"
                    className="aps-admin__crumb"
                    onClick={() => goToFolderDepth(index)}
                  >
                    / {folder.name}
                  </button>
                ))}
              </nav>
            ) : null}
            <ul className="aps-admin__list aps-admin__list--clickable">
              {!selectedProjectId ? (
                <li className="aps-admin__muted">Select a project</li>
              ) : contents.length === 0 ? (
                <li className="aps-admin__muted">Empty / unavailable</li>
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
      </div>
    </section>
  );
}
