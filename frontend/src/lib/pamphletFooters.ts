/**
 * Reusable static pamphlet footer profiles (JWT).
 * Snapshot vs linked bind lives on the pamphlet document, not here.
 */

import { EPAM_ROUTES } from "../config/routes";
import { apiRequest, formatApiError } from "./api";
import { getAuthToken } from "./auth";
import { createCorrelationId } from "./correlation";
import { emptyFooter, type PamphletFooter } from "./pamphlet-generator/src/pamphlet_schema";

export type FooterProfile = {
  userId: string;
  footerId: string;
  name: string;
  footer: PamphletFooter;
  createdAt?: string;
  updatedAt?: string;
};

export type FooterListResponse = {
  count: number;
  footers: FooterProfile[];
};

function requireToken(): string {
  const token = getAuthToken();
  if (!token) throw new Error("Sign in to manage pamphlet footers.");
  return token;
}

export async function fetchFooterProfiles(): Promise<FooterListResponse> {
  const result = await apiRequest<FooterListResponse>(EPAM_ROUTES.footers, {
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) throw new Error(formatApiError(result.error));
  return {
    count: result.data?.count ?? 0,
    footers: result.data?.footers ?? [],
  };
}

export async function createFooterProfile(payload: {
  name: string;
  footer: PamphletFooter;
}): Promise<FooterProfile> {
  const result = await apiRequest<FooterProfile>(EPAM_ROUTES.footers, {
    method: "POST",
    body: payload,
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) throw new Error(formatApiError(result.error));
  if (!result.data?.footerId) throw new Error("Empty footer create response");
  return result.data;
}

export async function updateFooterProfile(
  footerId: string,
  payload: { name: string; footer: PamphletFooter },
): Promise<FooterProfile> {
  const result = await apiRequest<FooterProfile>(EPAM_ROUTES.footer(footerId), {
    method: "PUT",
    body: payload,
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) throw new Error(formatApiError(result.error));
  if (!result.data?.footerId) throw new Error("Empty footer update response");
  return result.data;
}

export async function deleteFooterProfile(footerId: string): Promise<void> {
  const result = await apiRequest<{ ok?: boolean }>(EPAM_ROUTES.footer(footerId), {
    method: "DELETE",
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) throw new Error(formatApiError(result.error));
}

export function footerFromForm(values: {
  action: string;
  message: string;
  value1: string;
  value2: string;
  value3: string;
  value4: string;
}): PamphletFooter {
  const base = emptyFooter();
  return {
    ...base,
    action: values.action,
    message: values.message,
    value1: values.value1,
    value2: values.value2,
    value3: values.value3,
    value4: values.value4,
  };
}
