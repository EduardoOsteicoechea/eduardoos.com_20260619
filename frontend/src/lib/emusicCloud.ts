import { apiRequest, formatApiError } from "./api";
import { getAuthToken } from "./auth";
import { createCorrelationId } from "./telemetry";
import {
    cloneEmusicDocument,
    emusicApiUrl,
    type EmusicDocument,
} from "./emusic";

export async function saveEmusicToCloud(
    slug: string,
    document: EmusicDocument,
): Promise<EmusicDocument> {
    const token = getAuthToken();
    if (!token) {
        throw new Error("Inicia sesión para guardar .emusic en la nube.");
    }
    const correlationId = createCorrelationId();
    const result = await apiRequest<{ document: EmusicDocument }>(emusicApiUrl(slug), {
        method: "PUT",
        body: { document: cloneEmusicDocument(document) },
        correlationId,
        authToken: token,
    });
    if (result.error) {
        throw new Error(formatApiError(result.error));
    }
    if (!result.data?.document) {
        throw new Error("Empty emusic save response");
    }
    return cloneEmusicDocument(result.data.document);
}
