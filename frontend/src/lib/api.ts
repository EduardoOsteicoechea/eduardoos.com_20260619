import { invalidateAuthSession } from "./auth";
export interface ApiError {
    message: string;
    status: number;
    correlationId?: string;
    debugLogs?: string[];
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
    pamphletId?: string;
    fetchFn?: typeof fetch;
}
export async function apiRequest<T>(path: string, options: RequestOptions): Promise<ApiResponse<T>> {
    const fetchFn = options.fetchFn ?? fetch;
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Correlation-ID": options.correlationId,
    };
    if (options.authToken) {
        headers.Authorization = `Bearer ${options.authToken}`;
    }
    if (options.pamphletId) {
        headers["X-Pamphlet-Id"] = options.pamphletId;
    }
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
        }
        catch {
            data = undefined;
        }
    }
    if (!response.ok) {
        const payload = data as {
            message?: string;
            correlation_id?: string;
            debug_logs?: string[];
        } | undefined;
        const message = payload?.message ?? response.statusText;
        if (response.status === 401) {
            const normalized = message.toLowerCase();
            if (normalized.includes("invalid token") ||
                normalized.includes("authorization required") ||
                normalized.includes("jwt secret not configured")) {
                invalidateAuthSession();
            }
        }
        return {
            data,
            error: {
                message,
                status: response.status,
                correlationId: payload?.correlation_id,
                debugLogs: payload?.debug_logs,
            },
        };
    }
    return { data };
}
