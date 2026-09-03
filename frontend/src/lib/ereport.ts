/**
 * eReport client — cloud Issue Tracker under S3 ereport/.
 */

import { APP_ROUTES, EREPORT_ROUTES } from "../config/routes";
import { apiRequest, formatApiError } from "./api";
import { getAuthToken } from "./auth";
import { createCorrelationId } from "./correlation";

export type EreportPayload = {
  reportDate?: string;
  reportNumber?: string;
  appTitle?: string;
  sections?: unknown[];
  [key: string]: unknown;
};

export type ShareEntry = { email: string; userSafe: string };

export type EreportMeta = {
  id: string;
  tema: string;
  reportNumber?: string;
  reportDate?: string;
  orgId?: string;
  ownerEmail: string;
  ownerSafe: string;
  sharedWith: ShareEntry[];
  createdAt: string;
  updatedAt: string;
};

export type ReportCard = {
  id: string;
  tema: string;
  reportNumber?: string;
  updatedAt: string;
};

export type SharedItem = {
  ownerSafe: string;
  ownerEmail?: string;
  reportId: string;
  tema: string;
  updatedAt: string;
};

/** Org card in the owner's orgs.json index (046). */
export type OrgCard = {
  id: string;
  name: string;
  order: number;
  hidden: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OrgMeta = {
  id: string;
  name: string;
  ownerEmail: string;
  ownerSafe: string;
  order: number;
  hidden: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RecentReportCard = {
  orgId: string;
  orgName?: string;
  id: string;
  tema: string;
  reportNumber?: string;
  updatedAt: string;
};

export type EreportInvite = {
  token: string;
  scope: "org" | "report";
  ownerSafe: string;
  orgId: string;
  reportId?: string;
  email: string;
  expiresAt: string;
  createdAt: string;
  canEdit: boolean;
};

function requireToken(): string {
  const token = getAuthToken();
  if (!token) throw new Error("Sign in required for eReport.");
  return token;
}

export async function fetchEreportLibrary(): Promise<{
  userSafe: string;
  owned: ReportCard[];
  shared: SharedItem[];
  error?: string;
}> {
  const result = await apiRequest<{
    userSafe: string;
    owned: ReportCard[];
    shared: SharedItem[];
  }>(EREPORT_ROUTES.library, {
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) {
    return { userSafe: "", owned: [], shared: [], error: formatApiError(result.error) };
  }
  return {
    userSafe: result.data?.userSafe ?? "",
    owned: result.data?.owned ?? [],
    shared: result.data?.shared ?? [],
  };
}

export async function createEreport(tema: string): Promise<{
  meta: EreportMeta | null;
  payload: EreportPayload | null;
  error?: string;
}> {
  const result = await apiRequest<{ meta: EreportMeta; payload: EreportPayload }>(
    EREPORT_ROUTES.reports,
    {
      method: "POST",
      body: { tema },
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) {
    return { meta: null, payload: null, error: formatApiError(result.error) };
  }
  return { meta: result.data?.meta ?? null, payload: result.data?.payload ?? null };
}

export async function importEreport(
  tema: string,
  payload: EreportPayload,
): Promise<{
  meta: EreportMeta | null;
  error?: string;
}> {
  const result = await apiRequest<{ meta: EreportMeta }>(EREPORT_ROUTES.import, {
    method: "POST",
    body: { tema, payload },
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) {
    return { meta: null, error: formatApiError(result.error) };
  }
  return { meta: result.data?.meta ?? null };
}

export async function fetchEreport(
  ownerSafe: string,
  reportId: string,
): Promise<{
  meta: EreportMeta | null;
  payload: EreportPayload | null;
  canShare: boolean;
  isOwner: boolean;
  error?: string;
}> {
  const result = await apiRequest<{
    meta: EreportMeta;
    payload: EreportPayload;
    canShare?: boolean;
    isOwner?: boolean;
  }>(EREPORT_ROUTES.report(ownerSafe, reportId), {
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) {
    return {
      meta: null,
      payload: null,
      canShare: false,
      isOwner: false,
      error: formatApiError(result.error),
    };
  }
  return {
    meta: result.data?.meta ?? null,
    payload: result.data?.payload ?? null,
    canShare: Boolean(result.data?.canShare),
    isOwner: Boolean(result.data?.isOwner),
  };
}

export async function saveEreport(
  ownerSafe: string,
  reportId: string,
  body: { tema?: string; payload?: EreportPayload },
): Promise<{ meta: EreportMeta | null; error?: string }> {
  const result = await apiRequest<{ meta: EreportMeta }>(
    EREPORT_ROUTES.report(ownerSafe, reportId),
    {
      method: "PUT",
      body,
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) {
    return { meta: null, error: formatApiError(result.error) };
  }
  return { meta: result.data?.meta ?? null };
}

export async function deleteEreport(
  ownerSafe: string,
  reportId: string,
): Promise<{ ok: boolean; error?: string }> {
  const result = await apiRequest<{ deleted: boolean }>(
    EREPORT_ROUTES.report(ownerSafe, reportId),
    {
      method: "DELETE",
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) {
    return { ok: false, error: formatApiError(result.error) };
  }
  return { ok: true };
}

export async function putEreportShares(
  ownerSafe: string,
  reportId: string,
  emails: string[],
): Promise<{ meta: EreportMeta | null; error?: string }> {
  const result = await apiRequest<{ meta: EreportMeta }>(
    EREPORT_ROUTES.shares(ownerSafe, reportId),
    {
      method: "PUT",
      body: { emails },
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) {
    return { meta: null, error: formatApiError(result.error) };
  }
  return { meta: result.data?.meta ?? null };
}

export type EreportHistoryCard = {
  id: string;
  createdAt: string;
  source: string;
  keyPrefix?: string;
  tema: string;
};

export type EreportSnapshot = EreportHistoryCard & {
  payload: EreportPayload;
};

export async function listEreportHistory(
  ownerSafe: string,
  reportId: string,
): Promise<{ items: EreportHistoryCard[]; error?: string }> {
  const result = await apiRequest<{ items: EreportHistoryCard[] }>(
    EREPORT_ROUTES.history(ownerSafe, reportId),
    {
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) {
    return { items: [], error: formatApiError(result.error) };
  }
  return { items: result.data?.items ?? [] };
}

export async function restoreEreportHistory(
  ownerSafe: string,
  reportId: string,
  snapshotId: string,
): Promise<{
  meta: EreportMeta | null;
  payload: EreportPayload | null;
  error?: string;
}> {
  const result = await apiRequest<{ meta: EreportMeta; payload: EreportPayload }>(
    EREPORT_ROUTES.historyRestore(ownerSafe, reportId, snapshotId),
    {
      method: "POST",
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) {
    return { meta: null, payload: null, error: formatApiError(result.error) };
  }
  return {
    meta: result.data?.meta ?? null,
    payload: result.data?.payload ?? null,
  };
}

/** Org dashboard helpers below — keep existing exports. */

// --- Org + magic-link invite clients (046). Legacy helpers above stay for now. ---

export async function fetchEreportOrgs(): Promise<{
  userSafe: string;
  orgs: OrgCard[];
  recentReports: RecentReportCard[];
  error?: string;
}> {
  const result = await apiRequest<{
    userSafe: string;
    orgs: OrgCard[];
    recentReports: RecentReportCard[];
  }>(EREPORT_ROUTES.orgs, {
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) {
    return {
      userSafe: "",
      orgs: [],
      recentReports: [],
      error: formatApiError(result.error),
    };
  }
  return {
    userSafe: result.data?.userSafe ?? "",
    orgs: result.data?.orgs ?? [],
    recentReports: result.data?.recentReports ?? [],
  };
}

export async function createEreportOrg(
  name: string,
  firstReportName?: string,
): Promise<{
  org: OrgMeta | null;
  report: EreportMeta | null;
  error?: string;
}> {
  const body: { name: string; firstReportName?: string } = { name };
  if (firstReportName?.trim()) {
    body.firstReportName = firstReportName.trim();
  }
  const result = await apiRequest<{ org: OrgMeta; report?: EreportMeta }>(
    EREPORT_ROUTES.orgs,
    {
      method: "POST",
      body,
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) {
    return { org: null, report: null, error: formatApiError(result.error) };
  }
  return {
    org: result.data?.org ?? null,
    report: result.data?.report ?? null,
  };
}

export async function updateEreportOrgs(
  orgs: Array<{ id: string; name?: string; order?: number; hidden?: boolean }>,
): Promise<{ orgs: OrgCard[]; error?: string }> {
  const result = await apiRequest<{ orgs: OrgCard[] }>(EREPORT_ROUTES.orgs, {
    method: "PUT",
    body: { orgs },
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) {
    return { orgs: [], error: formatApiError(result.error) };
  }
  return { orgs: result.data?.orgs ?? [] };
}

export async function fetchEreportOrg(orgId: string): Promise<{
  org: OrgMeta | null;
  reports: ReportCard[];
  error?: string;
}> {
  const result = await apiRequest<{ org: OrgMeta; reports: ReportCard[] }>(
    EREPORT_ROUTES.org(orgId),
    {
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) {
    return { org: null, reports: [], error: formatApiError(result.error) };
  }
  return {
    org: result.data?.org ?? null,
    reports: result.data?.reports ?? [],
  };
}

export async function deleteEreportOrg(
  orgId: string,
): Promise<{ ok: boolean; error?: string }> {
  const result = await apiRequest<{ deleted: boolean }>(EREPORT_ROUTES.org(orgId), {
    method: "DELETE",
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) {
    return { ok: false, error: formatApiError(result.error) };
  }
  return { ok: true };
}

export async function createOrgEreport(
  orgId: string,
  tema: string,
): Promise<{
  meta: EreportMeta | null;
  payload: EreportPayload | null;
  error?: string;
}> {
  const result = await apiRequest<{ meta: EreportMeta; payload: EreportPayload }>(
    EREPORT_ROUTES.orgReports(orgId),
    {
      method: "POST",
      body: { tema },
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) {
    return { meta: null, payload: null, error: formatApiError(result.error) };
  }
  return { meta: result.data?.meta ?? null, payload: result.data?.payload ?? null };
}

export async function importOrgEreport(
  orgId: string,
  tema: string,
  payload: EreportPayload,
): Promise<{ meta: EreportMeta | null; error?: string }> {
  const result = await apiRequest<{ meta: EreportMeta }>(EREPORT_ROUTES.orgImport(orgId), {
    method: "POST",
    body: { tema, payload },
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) {
    return { meta: null, error: formatApiError(result.error) };
  }
  return { meta: result.data?.meta ?? null };
}

export async function fetchOrgEreport(
  orgId: string,
  reportId: string,
): Promise<{
  meta: EreportMeta | null;
  payload: EreportPayload | null;
  canShare: boolean;
  isOwner: boolean;
  error?: string;
}> {
  const result = await apiRequest<{
    meta: EreportMeta;
    payload: EreportPayload;
    canShare?: boolean;
    isOwner?: boolean;
  }>(EREPORT_ROUTES.orgReport(orgId, reportId), {
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) {
    return {
      meta: null,
      payload: null,
      canShare: false,
      isOwner: false,
      error: formatApiError(result.error),
    };
  }
  return {
    meta: result.data?.meta ?? null,
    payload: result.data?.payload ?? null,
    canShare: Boolean(result.data?.canShare),
    isOwner: Boolean(result.data?.isOwner),
  };
}

export async function saveOrgEreport(
  orgId: string,
  reportId: string,
  body: { tema?: string; payload?: EreportPayload },
): Promise<{ meta: EreportMeta | null; error?: string }> {
  const result = await apiRequest<{ meta: EreportMeta }>(
    EREPORT_ROUTES.orgReport(orgId, reportId),
    {
      method: "PUT",
      body,
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) {
    return { meta: null, error: formatApiError(result.error) };
  }
  return { meta: result.data?.meta ?? null };
}

export async function deleteOrgEreport(
  orgId: string,
  reportId: string,
): Promise<{ ok: boolean; error?: string }> {
  const result = await apiRequest<{ deleted: boolean }>(
    EREPORT_ROUTES.orgReport(orgId, reportId),
    {
      method: "DELETE",
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) {
    return { ok: false, error: formatApiError(result.error) };
  }
  return { ok: true };
}

export async function createOrgInvite(
  orgId: string,
  email: string,
  durationHours: number,
): Promise<{ invite: EreportInvite | null; link: string; error?: string }> {
  const result = await apiRequest<{ invite: EreportInvite; link: string }>(
    EREPORT_ROUTES.orgInvites(orgId),
    {
      method: "POST",
      body: { email, durationHours },
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) {
    return { invite: null, link: "", error: formatApiError(result.error) };
  }
  return {
    invite: result.data?.invite ?? null,
    link: result.data?.link ?? "",
  };
}

export async function createOrgReportInvite(
  orgId: string,
  reportId: string,
  email: string,
): Promise<{ invite: EreportInvite | null; link: string; error?: string }> {
  const result = await apiRequest<{ invite: EreportInvite; link: string }>(
    EREPORT_ROUTES.orgReportInvites(orgId, reportId),
    {
      method: "POST",
      body: { email },
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) {
    return { invite: null, link: "", error: formatApiError(result.error) };
  }
  return {
    invite: result.data?.invite ?? null,
    link: result.data?.link ?? "",
  };
}

/** Public magic-link fetch (no JWT). Optional reportId for org-scope invites. */
export async function fetchEreportInvite(
  token: string,
  reportId?: string,
): Promise<{
  invite: EreportInvite | null;
  valid: boolean;
  expired: boolean;
  canEdit: boolean;
  reports: ReportCard[];
  meta: EreportMeta | null;
  payload: EreportPayload | null;
  error?: string;
}> {
  let path = EREPORT_ROUTES.invite(token);
  if (reportId) {
    path += `?reportId=${encodeURIComponent(reportId)}`;
  }
  const result = await apiRequest<{
    invite: EreportInvite;
    valid: boolean;
    expired: boolean;
    canEdit: boolean;
    reports?: ReportCard[];
    meta?: EreportMeta;
    payload?: EreportPayload;
  }>(path, {
    correlationId: createCorrelationId(),
  });
  if (result.error) {
    return {
      invite: null,
      valid: false,
      expired: false,
      canEdit: false,
      reports: [],
      meta: null,
      payload: null,
      error: formatApiError(result.error),
    };
  }
  return {
    invite: result.data?.invite ?? null,
    valid: Boolean(result.data?.valid),
    expired: Boolean(result.data?.expired),
    canEdit: Boolean(result.data?.canEdit),
    reports: result.data?.reports ?? [],
    meta: result.data?.meta ?? null,
    payload: result.data?.payload ?? null,
  };
}

/** Public magic-link save (no JWT). reportId required for org-scope invites. */
export async function saveEreportInviteReport(
  token: string,
  body: { payload: EreportPayload; reportId?: string; tema?: string },
): Promise<{ meta: EreportMeta | null; error?: string }> {
  const result = await apiRequest<{ meta: EreportMeta }>(
    EREPORT_ROUTES.inviteReport(token),
    {
      method: "PUT",
      body,
      correlationId: createCorrelationId(),
    },
  );
  if (result.error) {
    return { meta: null, error: formatApiError(result.error) };
  }
  return { meta: result.data?.meta ?? null };
}

export function ereportHref(userSafe: string, reportId?: string): string {
  if (reportId) {
    const q = new URLSearchParams({ user: userSafe, report: reportId });
    return `${APP_ROUTES.ereportWorkspace}?${q.toString()}`;
  }
  const q = new URLSearchParams({ user: userSafe });
  return `${APP_ROUTES.ereportHub}?${q.toString()}`;
}

/** Pretty editor path for the address bar after the workspace shell loads. */
export function ereportPrettyPath(userSafe: string, reportId: string): string {
  return APP_ROUTES.ereportReport(userSafe, reportId);
}

/** Pretty hub path /ereport/{userSafe}. */
export function ereportHubPrettyPath(userSafe: string): string {
  return APP_ROUTES.ereportUser(userSafe);
}

export function resolveEreportHubFromLocation(loc?: {
  pathname: string;
}): string | null {
  if (!loc && typeof window === "undefined") return null;
  const path = (loc ?? window.location).pathname.replace(/\/+$/, "") || "/";
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "ereport" && parts.length === 2 && parts[1] !== "hub" && parts[1] !== "workspace") {
    return decodeURIComponent(parts[1]);
  }
  const params = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : "",
  );
  return params.get("user");
}

export function resolveEreportEditorFromLocation(loc?: {
  pathname: string;
  search: string;
}): { ownerSafe: string; reportId: string } | null {
  if (!loc && typeof window === "undefined") return null;
  const target = loc ?? window.location;
  const path = target.pathname.replace(/\/+$/, "") || "/";
  const parts = path.split("/").filter(Boolean);
  if (
    parts[0] === "ereport" &&
    parts.length >= 3 &&
    parts[1] !== "hub" &&
    parts[1] !== "workspace"
  ) {
    return {
      ownerSafe: decodeURIComponent(parts[1]),
      reportId: decodeURIComponent(parts[2]),
    };
  }
  const params = new URLSearchParams(target.search);
  const ownerSafe = params.get("user") ?? "";
  const reportId = params.get("report") ?? "";
  if (ownerSafe && reportId) return { ownerSafe, reportId };
  return null;
}
