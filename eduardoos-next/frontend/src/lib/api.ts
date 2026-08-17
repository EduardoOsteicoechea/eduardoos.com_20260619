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

/** Coerce unknown API message/body fields to a safe string (never assume .trim). */
function asErrorText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Flatten an ApiError into a single toast-friendly diagnostic string. */
export function formatApiError(error: ApiError): string {
  const parts: string[] = [];
  if (error.method || error.path) {
    parts.push(`${error.method ?? "GET"} ${error.path ?? ""}`.trim());
  }
  parts.push(`HTTP ${error.status}`);
  const message = asErrorText(error.message);
  if (message) parts.push(message);
  if (error.correlationId) parts.push(`correlation_id=${error.correlationId}`);
  if (error.debugLogs?.length) {
    parts.push(`debug_logs=[${error.debugLogs.join(" | ")}]`);
  }
  const rawBody = asErrorText(error.rawBody);
  if (rawBody && rawBody !== message) {
    const clipped = rawBody.length > 1200 ? `${rawBody.slice(0, 1200)}…` : rawBody;
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
      | { message?: unknown; error?: unknown; correlation_id?: unknown; debug_logs?: unknown }
      | undefined;
    const message =
      asErrorText(payload?.message) ||
      asErrorText(payload?.error) ||
      text.trim() ||
      response.statusText ||
      "request failed";

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

    const debugLogs = Array.isArray(payload?.debug_logs)
      ? payload.debug_logs.map((entry) => asErrorText(entry)).filter(Boolean)
      : undefined;

    return {
      data,
      error: {
        message,
        status: response.status,
        correlationId: asErrorText(payload?.correlation_id) || options.correlationId,
        debugLogs,
        rawBody: text || undefined,
        path,
        method,
      },
    };
  }

  return { data };
}
