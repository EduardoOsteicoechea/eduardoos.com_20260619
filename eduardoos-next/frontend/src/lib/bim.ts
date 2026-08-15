/**
 * BIM / IFC client for Eduardo OS Next.
 * Upload sends real file bytes via multipart; download returns stored octet-stream.
 */

import { BIM_ROUTES } from "../config/routes";
import { apiRequest, formatApiError } from "./api";
import { getAuthToken } from "./auth";
import { createCorrelationId } from "./correlation";

export type BimModel = {
  modelId: string;
  userId?: string;
  name: string;
  fileName?: string;
  contentSizeBytes?: number;
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
  return (result.data?.items ?? []).map((m) => ({
    ...m,
    name: m.name || m.fileName || m.modelId,
  }));
}

/** Registers metadata only (placeholder IFC body on the server). */
export async function createBimModel(name: string): Promise<BimModel> {
  const result = await apiRequest<BimModel>(BIM_ROUTES.upload, {
    method: "POST",
    body: { name: name.trim() || "untitled.ifc" },
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) throw new Error(formatApiError(result.error));
  if (!result.data?.modelId) throw new Error("Empty BIM create response");
  return {
    ...result.data,
    name: result.data.name || result.data.fileName || result.data.modelId,
  };
}

/** Uploads real IFC bytes via multipart/form-data (field "file"). */
export async function uploadBimModel(file: File): Promise<BimModel> {
  const token = requireToken();
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("name", file.name);
  const response = await fetch(BIM_ROUTES.upload, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Correlation-ID": createCorrelationId(),
    },
    body: form,
  });
  const text = await response.text();
  let data: BimModel | null = null;
  try {
    data = text ? (JSON.parse(text) as BimModel) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    throw new Error(text || `HTTP ${response.status}`);
  }
  if (!data?.modelId) throw new Error("Empty BIM upload response");
  return {
    ...data,
    name: data.name || data.fileName || data.modelId,
  };
}

export async function fetchBimFileBytes(modelId: string): Promise<{
  bytes: Uint8Array;
  textPreview: string;
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
  // Preview first ~8 KiB as text for the lightweight canvas panel.
  const previewLen = Math.min(bytes.byteLength, 8 * 1024);
  const textPreview = new TextDecoder().decode(bytes.subarray(0, previewLen));
  return { bytes, textPreview, byteLength: bytes.byteLength, contentType };
}

/** @deprecated Prefer fetchBimFileBytes; kept for any residual callers. */
export async function fetchBimFileText(modelId: string): Promise<{
  text: string;
  byteLength: number;
  contentType: string;
}> {
  const file = await fetchBimFileBytes(modelId);
  return {
    text: file.textPreview,
    byteLength: file.byteLength,
    contentType: file.contentType,
  };
}

export function downloadBimBytes(
  modelId: string,
  fileName: string,
  bytes: Uint8Array,
): void {
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".ifc") ? fileName : `${fileName || modelId}.ifc`;
  a.click();
  URL.revokeObjectURL(url);
}

/** @deprecated Prefer downloadBimBytes. */
export function downloadBimBlob(modelId: string, fileName: string, text: string): void {
  downloadBimBytes(modelId, fileName, new TextEncoder().encode(text));
}
