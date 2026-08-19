/**
 * Minimal edebat client against Next JWT APIs:
 * GET/POST /api/edebat, GET /api/edebat/{id}, POST /api/edebat/{id}/turn
 */

import { apiRequest, formatApiError } from "./api";
import { getAuthToken } from "./auth";
import { createCorrelationId } from "./correlation";

export type EdebatTurn = {
  role: string;
  text: string;
  at: string;
};

export type EdebatDocument = {
  id: string;
  userId?: string;
  topic: string;
  turns: EdebatTurn[];
  createdAt?: string;
  updatedAt?: string;
};

export const EDEBAT_ROUTES = {
  list: "/api/edebat",
  create: "/api/edebat",
  item: (id: string) => `/api/edebat/${encodeURIComponent(id)}`,
  turn: (id: string) => `/api/edebat/${encodeURIComponent(id)}/turn`,
} as const;

function requireToken(): string {
  const token = getAuthToken();
  if (!token) throw new Error("Sign in to use Edebat.");
  return token;
}

export async function listEdebats(): Promise<EdebatDocument[]> {
  const result = await apiRequest<{ edebats?: EdebatDocument[] }>(EDEBAT_ROUTES.list, {
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) throw new Error(formatApiError(result.error));
  return result.data?.edebats ?? [];
}

export async function createEdebat(topic: string): Promise<EdebatDocument> {
  const result = await apiRequest<{ document?: EdebatDocument }>(EDEBAT_ROUTES.create, {
    method: "POST",
    body: { topic: topic.trim() || "Untitled debate" },
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) throw new Error(formatApiError(result.error));
  if (!result.data?.document?.id) throw new Error("Empty edebat create response");
  return result.data.document;
}

export async function getEdebat(id: string): Promise<EdebatDocument> {
  const result = await apiRequest<{ document?: EdebatDocument }>(EDEBAT_ROUTES.item(id), {
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) throw new Error(formatApiError(result.error));
  if (!result.data?.document?.id) throw new Error("Empty edebat get response");
  return result.data.document;
}

export async function addEdebatTurn(
  id: string,
  role: string,
  text: string,
): Promise<EdebatDocument> {
  const result = await apiRequest<{ document?: EdebatDocument }>(EDEBAT_ROUTES.turn(id), {
    method: "POST",
    body: { role: role.trim(), text: text.trim() },
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) throw new Error(formatApiError(result.error));
  if (!result.data?.document?.id) throw new Error("Empty edebat turn response");
  return result.data.document;
}
