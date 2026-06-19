/**
 * api.ts — Thin HTTP client for the API gateway.
 * All requests attach X-Correlation-ID for distributed flight tracing.
 */

export interface ApiError {
  message: string;
  status: number;
}

export interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  correlationId: string;
  fetchFn?: typeof fetch;
}

/** Performs a JSON API call against the gateway with correlation header injection. */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions
): Promise<ApiResponse<T>> {
  const fetchFn = options.fetchFn ?? fetch;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Correlation-ID": options.correlationId,
  };

  const response = await fetchFn(path, {
    method: options.method ?? "GET",
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
    const message =
      (data as { message?: string } | undefined)?.message ??
      response.statusText;
    return {
      error: { message, status: response.status },
    };
  }

  return { data };
}
