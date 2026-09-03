/**
 * API key management client (spec 055) — JWT CRUD under /api/apikeys.
 */

import { APIKEYS_ROUTES } from "../config/routes";
import { apiRequest, formatApiError } from "./api";
import { getAuthToken } from "./auth";
import { createCorrelationId } from "./correlation";

export type ApiKeyRecord = {
  id: string;
  label: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
};

function requireToken(): string {
  const token = getAuthToken();
  if (!token) throw new Error("Not signed in");
  return token;
}

export async function listApiKeys(): Promise<{
  keys: ApiKeyRecord[];
  error?: string;
}> {
  const result = await apiRequest<{ keys: ApiKeyRecord[] }>(APIKEYS_ROUTES.list, {
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) {
    return { keys: [], error: formatApiError(result.error) };
  }
  return { keys: result.data?.keys ?? [] };
}

export async function createApiKey(label: string): Promise<{
  key: string | null;
  record: ApiKeyRecord | null;
  error?: string;
}> {
  const result = await apiRequest<{ key: string; record: ApiKeyRecord }>(
    APIKEYS_ROUTES.create,
    {
      method: "POST",
      body: { label },
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) {
    return { key: null, record: null, error: formatApiError(result.error) };
  }
  return {
    key: result.data?.key ?? null,
    record: result.data?.record ?? null,
  };
}

export async function revokeApiKey(id: string): Promise<{
  record: ApiKeyRecord | null;
  error?: string;
}> {
  const result = await apiRequest<{ record: ApiKeyRecord }>(
    APIKEYS_ROUTES.revoke(id),
    {
      method: "DELETE",
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) {
    return { record: null, error: formatApiError(result.error) };
  }
  return { record: result.data?.record ?? null };
}
