import { apiRequest } from "./api";
import { getAuthToken } from "./auth";
import { EPAM_ROUTES } from "../config/routes";
import { createCorrelationId } from "./telemetry";
import type { PamphletStructure } from "./pamphlet-generator/src/pamphlet_schema";

export interface EpamRecord {
    userId: string;
    epamId: string;
    fileName: string;
    title: string;
    series: string;
    seriesChapter: string;
    author: string;
    date: string;
    s3Key: string;
    contentSizeBytes: number;
    createdAt: string;
    updatedAt: string;
    lastCorrelationId?: string;
}

export interface EpamsListResponse {
    count: number;
    epams: EpamRecord[];
}

export interface EpamDocumentResponse {
    meta: EpamRecord;
    document: PamphletStructure;
}

export async function fetchEpams(): Promise<EpamsListResponse> {
    const correlationId = createCorrelationId();
    const token = getAuthToken();
    if (!token) {
        throw new Error("Inicia sesión para abrir desde la nube.");
    }
    const result = await apiRequest<EpamsListResponse>(EPAM_ROUTES.list, {
        correlationId,
        authToken: token,
    });
    if (result.error) {
        throw new Error(result.error.message);
    }
    return {
        count: result.data?.count ?? 0,
        epams: result.data?.epams ?? [],
    };
}

export async function fetchEpam(epamId: string): Promise<EpamDocumentResponse> {
    const correlationId = createCorrelationId();
    const token = getAuthToken();
    if (!token) {
        throw new Error("Inicia sesión para abrir desde la nube.");
    }
    const result = await apiRequest<EpamDocumentResponse>(EPAM_ROUTES.item(epamId), {
        correlationId,
        authToken: token,
    });
    if (result.error) {
        throw new Error(result.error.message);
    }
    if (!result.data?.document || !result.data.meta) {
        throw new Error("Empty epam response");
    }
    return result.data;
}

export async function saveEpamToCloud(payload: {
    epamId?: string;
    fileName?: string;
    document: PamphletStructure;
}): Promise<EpamDocumentResponse> {
    const correlationId = createCorrelationId();
    const token = getAuthToken();
    if (!token) {
        throw new Error("Inicia sesión para guardar en la nube.");
    }
    // PUT only when updating an existing cloud id; otherwise POST /api/epams.
    const updateId = payload.epamId?.trim();
    const epamId = updateId || payload.document.id?.trim();
    const path = updateId ? EPAM_ROUTES.item(updateId) : EPAM_ROUTES.save;
    const method = updateId ? "PUT" : "POST";
    const result = await apiRequest<EpamDocumentResponse>(path, {
        method,
        body: {
            epamId: epamId || undefined,
            fileName: payload.fileName,
            document: payload.document,
        },
        correlationId,
        authToken: token,
    });
    if (result.error) {
        throw new Error(result.error.message);
    }
    if (!result.data?.document || !result.data.meta) {
        throw new Error("Empty epam save response");
    }
    return result.data;
}
