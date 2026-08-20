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
