/**
 * Admin API client — list users, grant entitlements, delete accounts.
 */

import { ADMIN_ROUTES } from "../config/routes";
import { apiRequest, formatApiError } from "./api";
import { getAuthToken } from "./auth";
import { createCorrelationId } from "./correlation";
import type { BillingPeriod, EntitlementRecord } from "./payments";

export type AdminUserRow = {
  email: string;
  name?: string;
  role: string;
  verified: boolean;
  createdAt: string;
  entitlements: EntitlementRecord[];
  serviceIds: string[];
};

export type AdminServiceRow = {
  id: string;
  label: string;
  description: string;
  monthly_usd: number;
};

export type BulkRegisterResultRow = {
  index: number;
  email: string;
  name?: string;
  status: "created" | "failed" | string;
  reason?: string;
};

export type BulkRegisterResponse = {
  created: number;
  failed: number;
  results: BulkRegisterResultRow[];
};

function requireToken(): string {
  const token = getAuthToken();
  if (!token) throw new Error("Sign in as admin.");
  return token;
}

export async function fetchAdminUsers(): Promise<AdminUserRow[]> {
  const result = await apiRequest<{ users: AdminUserRow[] }>(ADMIN_ROUTES.users, {
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) throw new Error(formatApiError(result.error));
  return result.data?.users ?? [];
}

export async function bulkRegisterUsers(
  users: Array<Record<string, string>>,
): Promise<BulkRegisterResponse> {
  const result = await apiRequest<BulkRegisterResponse>(ADMIN_ROUTES.bulkRegister, {
    method: "POST",
    body: users,
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) throw new Error(formatApiError(result.error));
  return (
    result.data ?? {
      created: 0,
      failed: 0,
      results: [],
    }
  );
}

export async function fetchAdminServices(): Promise<AdminServiceRow[]> {
  const result = await apiRequest<{ services: AdminServiceRow[] }>(
    ADMIN_ROUTES.services,
    {
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) throw new Error(formatApiError(result.error));
  return result.data?.services ?? [];
}

export async function putUserEntitlements(
  email: string,
  services: string[],
  billingPeriod: BillingPeriod = "monthly",
  months = 1,
): Promise<EntitlementRecord[]> {
  const result = await apiRequest<{ entitlements: EntitlementRecord[] }>(
    ADMIN_ROUTES.userEntitlements(email),
    {
      method: "PUT",
      body: { services, billing_period: billingPeriod, months },
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) throw new Error(formatApiError(result.error));
  return result.data?.entitlements ?? [];
}

export async function deleteAdminUser(email: string): Promise<void> {
  const result = await apiRequest<{ deleted?: boolean }>(
    ADMIN_ROUTES.deleteUser(email),
    {
      method: "DELETE",
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) throw new Error(formatApiError(result.error));
}

export type ChurchAuthRequestRow = {
  email: string;
  status: string;
  requestedAt: string;
  decidedAt?: string;
  decidedBy?: string;
  note?: string;
};

export async function fetchChurchAuthRequests(
  status = "pending",
): Promise<ChurchAuthRequestRow[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const result = await apiRequest<{ requests: ChurchAuthRequestRow[] }>(
    `${ADMIN_ROUTES.churchAuthRequests}${qs}`,
    {
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) throw new Error(formatApiError(result.error));
  return result.data?.requests ?? [];
}

export async function approveChurchAuth(email: string): Promise<void> {
  const result = await apiRequest(
    ADMIN_ROUTES.approveChurchAuth(email),
    {
      method: "POST",
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) throw new Error(formatApiError(result.error));
}

export async function rejectChurchAuth(email: string): Promise<void> {
  const result = await apiRequest(
    ADMIN_ROUTES.rejectChurchAuth(email),
    {
      method: "POST",
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) throw new Error(formatApiError(result.error));
}
