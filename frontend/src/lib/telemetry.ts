import { getAuthToken } from "./auth";
export interface FlightLogEntry {
    correlationId: string;
    service: string;
    event: string;
    status: "started" | "success" | "error";
    timestamp: string;
    metadata?: Record<string, string>;
}
export function createCorrelationId(): string {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `corr-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
export function buildFlightLog(event: string, status: FlightLogEntry["status"], correlationId: string, metadata?: Record<string, string>): FlightLogEntry {
    return {
        correlationId,
        service: "frontend",
        event,
        status,
        timestamp: new Date().toISOString(),
        metadata,
    };
}
export function serializeFlightLog(entry: FlightLogEntry): string {
    return JSON.stringify(entry);
}
export async function emitFlightLog(entry: FlightLogEntry, fetchFn: typeof fetch = fetch): Promise<void> {
    try {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "X-Correlation-ID": entry.correlationId,
        };
        const token = getAuthToken();
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }
        const response = await fetchFn("/api/logger", {
            method: "POST",
            headers,
            body: serializeFlightLog(entry),
        });
        if (!response.ok && typeof console !== "undefined") {
            console.debug("[telemetry] emit skipped", response.status, entry.event);
        }
    }
    catch {
    }
}
