import { apiRequest } from "./api";
import { getAuthToken } from "./auth";
import { createCorrelationId } from "./telemetry";
export interface PamphletDocument {
    header: Record<string, unknown>;
    content: {
        ideas: unknown[];
    };
    footer: Record<string, unknown>;
}
export interface LayoutFields {
    marginLateral: number;
    marginVertical: number;
    midMargin: number;
    colSep: number;
    hfGap: number;
    fontSize: number;
    lineHeight: number;
    paragraphSep: number;
    headingBottomMargin: number;
}
export const DEFAULT_LAYOUT: LayoutFields = {
    marginLateral: 10,
    marginVertical: 10,
    midMargin: 25,
    colSep: 4,
    hfGap: 5,
    fontSize: 10,
    lineHeight: 1.2,
    paragraphSep: 1,
    headingBottomMargin: 5,
};
export const PAMPHLET_ROUTES = {
    document: "/api/pamphlets/document",
    registry: "/api/pamphlets/registry",
    save: "/api/pamphlets/save",
} as const;
export interface SavePamphletBundleResponse {
    status: string;
    pamphletId: string;
    logs: string[];
    ideaCount?: number;
    subideaCount?: number;
}
export interface PamphletRegistryItem {
    pamphletId: string;
    title: string;
    updatedAt?: string;
    layout?: LayoutFields;
}
function authOptions(correlationId: string, pamphletId?: string) {
    const token = getAuthToken();
    return {
        correlationId,
        authToken: token ?? undefined,
        pamphletId,
    };
}
export async function fetchPamphletDocumentById(pamphletId: string): Promise<PamphletDocument> {
    const correlationId = createCorrelationId();
    const path = `${PAMPHLET_ROUTES.document}?pamphletId=${encodeURIComponent(pamphletId)}`;
    const result = await apiRequest<PamphletDocument>(path, authOptions(correlationId, pamphletId));
    if (result.error) {
        throw new Error(result.error.message);
    }
    return result.data as PamphletDocument;
}
export async function fetchPamphletRegistry(sort: "alpha" | "date" = "alpha"): Promise<PamphletRegistryItem[]> {
    const correlationId = createCorrelationId();
    const sortParam = sort === "date" ? "date" : "alpha";
    const result = await apiRequest<{
        pamphlets: PamphletRegistryItem[];
    }>(`${PAMPHLET_ROUTES.registry}?sort=${sortParam}`, authOptions(correlationId));
    if (result.error) {
        throw new Error(result.error.message);
    }
    return result.data?.pamphlets ?? [];
}
export async function savePamphletBundleToCloud(pamphletId: string, title: string, document: PamphletDocument, layout: LayoutFields): Promise<SavePamphletBundleResponse> {
    const correlationId = createCorrelationId();
    const path = `${PAMPHLET_ROUTES.save}?pamphletId=${encodeURIComponent(pamphletId)}`;
    const result = await apiRequest<SavePamphletBundleResponse>(path, {
        method: "POST",
        body: { title, layout, document },
        ...authOptions(correlationId, pamphletId),
    });
    if (result.error) {
        throw new Error(result.error.message);
    }
    return result.data as SavePamphletBundleResponse;
}
