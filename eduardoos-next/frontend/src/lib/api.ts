/**
 * Shared JSON API client. Always sends X-Correlation-ID; optionally Bearer auth.
 * On 401 with token-related messages, clears the Next auth session.
 */

import { invalidateAuthSession } from "./auth";

export interface ApiError {
  message: string;
  status: number;
  correlationId?: string;
  debugLogs?: string[];
  rawBody?: string;
  path?: string;
  method?: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  correlationId: string;
  authToken?: string;
  fetchFn?: typeof fetch;
}

/** Flatten an ApiError into a single toast-friendly diagnostic string. */
export function formatApiError(error: ApiError): string {
  const parts: string[] = [];
  if (error.method || error.path) {
    parts.push(`${error.method ?? "GET"} ${error.path ?? ""}`.trim());
  }
  parts.push(`HTTP ${error.status}`);
  if (error.message) parts.push(error.message);
  if (error.correlationId) parts.push(`correlation_id=${error.correlationId}`);
  if (error.debugLogs?.length) {
    parts.push(`debug_logs=[${error.debugLogs.join(" | ")}]`);
  }
  if (error.rawBody && error.rawBody.trim() && error.rawBody.trim() !== error.message) {
    const clipped =
      error.rawBody.length > 1200 ? `${error.rawBody.slice(0, 1200)}…` : error.rawBody;
    parts.push(`body=${clipped}`);
  }
  return parts.join(" · ");
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions,
): Promise<ApiResponse<T>> {
  const fetchFn = options.fetchFn ?? fetch;
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Correlation-ID": options.correlationId,
  };
  if (options.authToken) {
    headers.Authorization = `Bearer ${options.authToken}`;
  }

  const response = await fetchFn(path, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let data: T | undefined;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = undefined;
    }
  }

  if (!response.ok) {
    const payload = data as
      | { message?: string; correlation_id?: string; debug_logs?: string[] }
      | undefined;
    const message =
      payload?.message ?? (text.trim() || response.statusText || "request failed");

    if (response.status === 401) {
      const normalized = message.toLowerCase();
      if (
        normalized.includes("invalid token") ||
        normalized.includes("authorization required") ||
        normalized.includes("jwt secret not configured")
      ) {
        invalidateAuthSession();
      }
    }

    return {
      data,
      error: {
        message,
        status: response.status,
        correlationId: payload?.correlation_id ?? options.correlationId,
        debugLogs: payload?.debug_logs,
        rawBody: text || undefined,
        path,
        method,
      },
    };
  }

  return { data };
}
