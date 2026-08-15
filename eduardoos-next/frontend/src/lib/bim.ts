/**
 * BIM / IFC client for Eduardo OS Next memory (and later Dynamo/S3) backend.
 * Create is JSON { name }; file download is octet-stream placeholder IFC.
 */

import { BIM_ROUTES } from "../config/routes";
import { apiRequest, formatApiError } from "./api";
import { getAuthToken } from "./auth";
import { createCorrelationId } from "./correlation";

export type BimModel = {
  modelId: string;
  userId?: string;
  name: string;
  updatedAt?: string;
};

type ListResponse = {
  items?: BimModel[];
};

function requireToken(): string {
  const token = getAuthToken();
  if (!token) throw new Error("Sign in to open BIM models.");
  return token;
}

export async function fetchBimModels(): Promise<BimModel[]> {
  const result = await apiRequest<ListResponse>(BIM_ROUTES.list, {
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) throw new Error(formatApiError(result.error));
  return result.data?.items ?? [];
}

/** Registers a model metadata row; memory backend stores a placeholder IFC body. */
export async function createBimModel(name: string): Promise<BimModel> {
  const result = await apiRequest<BimModel>(BIM_ROUTES.upload, {
    method: "POST",
    body: { name: name.trim() || "untitled.ifc" },
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) throw new Error(formatApiError(result.error));
  if (!result.data?.modelId) throw new Error("Empty BIM create response");
  return result.data;
}

export async function fetchBimFileText(modelId: string): Promise<{
  text: string;
  byteLength: number;
  contentType: string;
}> {
  const token = requireToken();
  const response = await fetch(BIM_ROUTES.file(modelId), {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Correlation-ID": createCorrelationId(),
    },
  });
  const contentType = response.headers.get("Content-Type") ?? "application/octet-stream";
  const buffer = await response.arrayBuffer();
  if (!response.ok) {
    const text = new TextDecoder().decode(buffer);
    throw new Error(text || `HTTP ${response.status}`);
  }
  const bytes = new Uint8Array(buffer);
  const text = new TextDecoder().decode(bytes);
  return { text, byteLength: bytes.byteLength, contentType };
}

export function downloadBimBlob(modelId: string, fileName: string, text: string): void {
  const blob = new Blob([text], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".ifc") ? fileName : `${fileName || modelId}.ifc`;
  a.click();
  URL.revokeObjectURL(url);
}
