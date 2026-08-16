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
