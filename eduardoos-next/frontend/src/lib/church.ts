/**
 * Church API client — registry, groups, overview, activities, reports.
 * Failures surface via ServerErrorModal (openApiErrorModal).
 */

import { APP_ROUTES, CHURCH_ROUTES } from "../config/routes";
import { apiRequest, formatApiError } from "./api";
import { getAuthToken } from "./auth";
import { createCorrelationId } from "./correlation";
import { openApiErrorModal } from "../components/ServerErrorModal/ServerErrorModal";

export type ChurchRole = "church-admin" | "church-member" | "admin";

export type ChurchCard = {
  denominationId: string;
  churchId: string;
  name: string;
  network?: string;
  s3Prefix: string;
  ownerEmail: string;
  createdAt: string;
  updatedAt: string;
};

export type DenominationGroup = {
  id: string;
  name: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type LeaderRoleOption = { id: string; label: string };

/** Fixed líder ministry roles (mirrors backend LeaderRoleOptions). */
export const LEADER_ROLE_OPTIONS: LeaderRoleOption[] = [
  { id: "elder-bishop-pastor", label: "elder/bishop/pastor" },
  { id: "evangelist", label: "evangelist" },
  { id: "teacher-preacher-prophet", label: "teacher/preacher/prophet" },
  { id: "ministry-leader", label: "ministry leader" },
  {
    id: "apostolic-partner-church-planter-missionary",
    label: "apostolic partner/church planter/missionary",
  },
];

export type ChurchLeader = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  /** Display name; derived from first+last, or legacy single-string records. */
  name?: string;
  roles: string[];
};

export type ChurchMember = {
  email: string;
  firstName?: string;
  secondName?: string;
  lastName1?: string;
  lastName2?: string;
  address?: string;
  phone?: string;
  name?: string;
  role: "church-admin" | "church-member";
  churchId?: string;
  authorizedActivityIds?: string[];
};

export type LocalChurchInput = {
  churchId?: string;
  name: string;
  openedAt?: string;
  address?: string;
  leadership?: string[];
};

export type SectorActivity = {
  sector: string;
  description?: string;
};

export type ChurchDoc = {
  denominationId: string;
  churchId: string;
  name: string;
  openedAt?: string;
  address?: string;
  leaders?: ChurchLeader[];
  orgLeaders?: ChurchLeader[];
  pastors?: string[];
  network?: string;
  localChurches?: string[];
  beliefsDocument?: string;
  sectorActivities?: SectorActivity[];
  members: ChurchMember[];
  ownerEmail: string;
  s3Prefix: string;
  createdAt: string;
  updatedAt: string;
};

export type ChurchActivity = {
  id: string;
  title: string;
  sector?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  authorizedEmails?: string[];
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type ActivityReport = {
  id: string;
  activityId: string;
  authorEmail: string;
  text: string;
  imageNames?: string[];
  createdAt: string;
};

export type ChurchDetail = {
  church: ChurchDoc;
  activities: ChurchActivity[];
  viewerRole: ChurchRole;
};

export type OverviewPayload = {
  memberships: Array<{
    email: string;
    denominationId: string;
    churchId: string;
    role: string;
    churchName?: string;
  }>;
  churches: Array<{
    church: ChurchDoc;
    activities: ChurchActivity[];
    viewerRole: ChurchRole;
  }>;
};

export type ActivityRow = {
  denominationId: string;
  churchId: string;
  churchName: string;
  activity: ChurchActivity;
  reports: ActivityReport[];
  viewerRole: ChurchRole;
};

/** Normalize a name into a URL/S3 slug (mirrors backend SanitizeSlug). */
export function sanitizeChurchSlug(raw: string): string {
  const lower = raw.trim().toLowerCase();
  if (!lower) return "";
  let out = "";
  let prevHyphen = false;
  for (const ch of lower) {
    if (/[a-z0-9]/.test(ch)) {
      out += ch;
      prevHyphen = false;
    } else if (" _-./".includes(ch)) {
      if (out.length > 0 && !prevHyphen) {
        out += "-";
        prevHyphen = true;
      }
    }
  }
  out = out.replace(/^-+|-+$/g, "");
  if (out.length > 80) out = out.slice(0, 80).replace(/-+$/g, "");
  if (!out || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(out)) return "";
  return out;
}

export function churchDetailHref(denomId: string, churchId: string): string {
  return APP_ROUTES.churchDetail(denomId, churchId);
}

export function memberDisplayName(m: ChurchMember): string {
  if (m.name?.trim()) return m.name.trim();
  return [m.firstName, m.secondName, m.lastName1, m.lastName2]
    .map((p) => (p || "").trim())
    .filter(Boolean)
    .join(" ");
}

/** Display "nombre apellido", falling back to legacy name-only records. */
export function leaderDisplayName(L: ChurchLeader): string {
  const first = (L.firstName || "").trim();
  const last = (L.lastName || "").trim();
  if (first || last) return `${first} ${last}`.trim();
  return (L.name || "").trim();
}

export function leaderRoleLabel(id: string): string {
  return LEADER_ROLE_OPTIONS.find((r) => r.id === id)?.label || id;
}

/** Pretty /church/{denom}/{id} or workspace?denom=&church=. */
export function resolveChurchIdsFromLocation(
  pathname = typeof window !== "undefined" ? window.location.pathname : "",
  search = typeof window !== "undefined" ? window.location.search : "",
): { denomId: string; churchId: string } {
  const params = new URLSearchParams(search);
  const qDenom = (params.get("denom") || params.get("denomination") || "").trim();
  const qChurch = (params.get("church") || "").trim();
  if (qDenom && qChurch) {
    return { denomId: qDenom, churchId: qChurch };
  }
  const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  // /church/{denom}/{churchId}
  if (parts[0] === "church" && parts.length >= 3) {
    const reserved = new Set(["register", "overview", "activity", "workspace", "groups"]);
    if (!reserved.has(parts[1])) {
      return { denomId: decodeURIComponent(parts[1]), churchId: decodeURIComponent(parts[2]) };
    }
  }
  return { denomId: "", churchId: "" };
}

async function churchRequest<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = getAuthToken();
  const correlationId = createCorrelationId();
  const result = await apiRequest<T>(path, {
    method: options.method ?? "GET",
    body: options.body,
    correlationId,
    authToken: token || undefined,
  });
  if (result.error) {
    openApiErrorModal(formatApiError(result.error), {
      title: "Church API error",
      summary: `${options.method ?? "GET"} ${path}`,
    });
    throw new Error(result.error.message || "Church request failed");
  }
  return result.data as T;
}

export function listChurches(q = ""): Promise<{ churches: ChurchCard[] }> {
  const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  return churchRequest(`${CHURCH_ROUTES.list}${qs}`);
}

export function listChurchGroups(): Promise<{ groups: DenominationGroup[] }> {
  return churchRequest(CHURCH_ROUTES.groups);
}

export function createChurchGroup(payload: {
  id?: string;
  name: string;
}): Promise<{ group: DenominationGroup }> {
  return churchRequest(CHURCH_ROUTES.groups, { method: "POST", body: payload });
}

export function updateChurchGroup(
  id: string,
  payload: { name: string },
): Promise<{ group: DenominationGroup }> {
  return churchRequest(CHURCH_ROUTES.group(id), { method: "PUT", body: payload });
}

export function deleteChurchGroup(id: string): Promise<{ deleted: boolean }> {
  return churchRequest(CHURCH_ROUTES.group(id), { method: "DELETE" });
}

export function registerChurch(payload: Record<string, unknown>): Promise<{
  church: ChurchCard;
  document: ChurchDoc;
  churches?: ChurchCard[];
  documents?: ChurchDoc[];
}> {
  return churchRequest(CHURCH_ROUTES.list, { method: "POST", body: payload });
}

export type ChurchAuthStatus = "none" | "pending" | "approved" | "rejected";

export type ChurchAuthorization = {
  email: string;
  isPlatformAdmin: boolean;
  authorizationStatus: ChurchAuthStatus;
  hasChurchManagement: boolean;
  canRegister: boolean;
  gateReason?: string;
  requestedAt?: string;
  decidedAt?: string;
  subscribePath?: string;
  serviceId?: string;
};

export function fetchChurchAuthorization(): Promise<ChurchAuthorization> {
  return churchRequest(CHURCH_ROUTES.authorization);
}

export function requestChurchAuthorization(): Promise<{
  email: string;
  authorizationStatus: ChurchAuthStatus;
  message?: string;
  requestedAt?: string;
}> {
  return churchRequest(CHURCH_ROUTES.requestAuthorization, { method: "POST" });
}

export function fetchChurch(denomId: string, churchId: string): Promise<ChurchDetail> {
  return churchRequest(CHURCH_ROUTES.church(denomId, churchId));
}

export function updateChurch(
  denomId: string,
  churchId: string,
  payload: Partial<ChurchDoc>,
): Promise<{ church: ChurchDoc }> {
  return churchRequest(CHURCH_ROUTES.church(denomId, churchId), {
    method: "PUT",
    body: payload,
  });
}

export function fetchChurchOverview(): Promise<OverviewPayload> {
  return churchRequest(CHURCH_ROUTES.overview);
}

export function fetchMyChurchActivities(): Promise<{ activities: ActivityRow[] }> {
  return churchRequest(CHURCH_ROUTES.activity);
}

export function createChurchActivity(
  denomId: string,
  churchId: string,
  payload: Record<string, unknown>,
): Promise<{ activity: ChurchActivity }> {
  return churchRequest(CHURCH_ROUTES.activities(denomId, churchId), {
    method: "POST",
    body: payload,
  });
}

export async function postActivityReport(
  denomId: string,
  churchId: string,
  activityId: string,
  text: string,
  images: File[] = [],
): Promise<{ report: ActivityReport }> {
  const token = getAuthToken();
  const correlationId = createCorrelationId();
  const path = CHURCH_ROUTES.report(denomId, churchId, activityId);
  if (images.length === 0) {
    return churchRequest(path, { method: "POST", body: { text } });
  }
  const form = new FormData();
  form.append("text", text);
  for (const file of images) {
    form.append("images", file);
  }
  const headers: Record<string, string> = {
    "X-Correlation-ID": correlationId,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { method: "POST", headers, body: form });
  const raw = await res.text();
  let data: { report?: ActivityReport; error?: string } = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {};
  }
  if (!res.ok) {
    const msg = data.error || raw || `HTTP ${res.status}`;
    openApiErrorModal(String(msg), {
      title: "Church report error",
      summary: `POST ${path} correlation_id=${correlationId}`,
    });
    throw new Error(String(msg));
  }
  return data as { report: ActivityReport };
}

export function churchImageUrl(
  denomId: string,
  churchId: string,
  activityId: string,
  name: string,
): string {
  return CHURCH_ROUTES.image(denomId, churchId, activityId, name);
}

export function roleLabel(role: string): string {
  switch (role) {
    case "church-admin":
      return "Church admin";
    case "church-member":
      return "Church member";
    case "admin":
      return "Platform admin";
    default:
      return role;
  }
}
