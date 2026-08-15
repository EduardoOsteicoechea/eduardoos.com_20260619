/**
 * EPAM (pamphlet document) client against Next /api/epams.
 */

import { EPAM_ROUTES } from "../config/routes";
import { apiRequest, formatApiError } from "./api";
import { getAuthToken } from "./auth";
import { createCorrelationId } from "./correlation";

export type EpamDoc = {
  id: string;
  userId?: string;
  title: string;
  updatedAt?: string;
  body?: Record<string, unknown>;
};

type ListResponse = {
  items?: EpamDoc[];
};

function requireToken(): string {
  const token = getAuthToken();
  if (!token) throw new Error("Sign in to manage pamphlets.");
  return token;
}

export async function listEpams(): Promise<EpamDoc[]> {
  const result = await apiRequest<ListResponse>(EPAM_ROUTES.list, {
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) throw new Error(formatApiError(result.error));
  return result.data?.items ?? [];
}

export async function createEpam(
  title: string,
  body?: Record<string, unknown>,
): Promise<EpamDoc> {
  const result = await apiRequest<EpamDoc>(EPAM_ROUTES.save, {
    method: "POST",
    body: {
      title: title.trim() || "Untitled pamphlet",
      body: body ?? {
        version: 1,
        blocks: [{ type: "paragraph", text: "New pamphlet document." }],
      },
    },
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) throw new Error(formatApiError(result.error));
  if (!result.data?.id) throw new Error("Empty EPAM create response");
  return result.data;
}

export async function getEpam(id: string): Promise<EpamDoc> {
  const result = await apiRequest<EpamDoc>(EPAM_ROUTES.item(id), {
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) throw new Error(formatApiError(result.error));
  if (!result.data?.id) throw new Error("EPAM not found");
  return result.data;
}

export async function updateEpam(
  id: string,
  payload: { title?: string; body?: Record<string, unknown> },
): Promise<EpamDoc> {
  const result = await apiRequest<EpamDoc>(EPAM_ROUTES.item(id), {
    method: "PUT",
    body: payload,
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) throw new Error(formatApiError(result.error));
  if (!result.data?.id) throw new Error("Empty EPAM update response");
  return result.data;
}
