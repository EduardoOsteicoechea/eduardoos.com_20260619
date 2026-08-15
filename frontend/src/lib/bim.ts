import { apiRequest, formatApiError } from "./api";
import { getAuthToken } from "./auth";
import { BIM_ROUTES } from "../config/routes";
import { createCorrelationId } from "./telemetry";

export type IfcBimRecord = {
  userId: string;
  modelId: string;
  fileName: string;
  title: string;
  s3Key: string;
  contentType: string;
  contentSizeBytes: number;
  createdAt: string;
  updatedAt: string;
};

type ListResponse = {
  count: number;
  models: IfcBimRecord[];
};

type UploadResponse = {
  model: IfcBimRecord;
};

function requireToken(): string {
  const token = getAuthToken();
  if (!token) {
    throw new Error("Sign in to open BIM models.");
  }
  return token;
}

export async function fetchBimModels(): Promise<IfcBimRecord[]> {
  const correlationId = createCorrelationId();
  const result = await apiRequest<ListResponse>(BIM_ROUTES.list, {
    correlationId,
    authToken: requireToken(),
  });
  if (result.error) {
    throw new Error(formatApiError(result.error));
  }
  return result.data?.models ?? [];
}

export async function uploadBimModel(file: File, title?: string): Promise<IfcBimRecord> {
  const token = requireToken();
  const correlationId = createCorrelationId();
  const body = new FormData();
  body.append("file", file, file.name);
  if (title?.trim()) {
    body.append("title", title.trim());
  }
  const response = await fetch(BIM_ROUTES.upload, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Correlation-ID": correlationId,
    },
    body,
  });
  const text = await response.text();
  let data: UploadResponse | undefined;
  try {
    data = text ? (JSON.parse(text) as UploadResponse) : undefined;
  } catch {
    data = undefined;
  }
  if (!response.ok) {
    const message =
      (data as { message?: string } | undefined)?.message || text || response.statusText;
    throw new Error(message);
  }
  if (!data?.model) {
    throw new Error("Empty BIM upload response");
  }
  return data.model;
}

export async function fetchBimFile(modelId: string): Promise<Uint8Array> {
  const token = requireToken();
  const correlationId = createCorrelationId();
  const response = await fetch(BIM_ROUTES.file(modelId), {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Correlation-ID": correlationId,
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}
