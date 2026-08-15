import { apiRequest, formatApiError } from "./api";
import { getAuthToken, isApsAdminEmail, getAuthEmailFromToken } from "./auth";
import { isLocalTrackKey, trackDisplayName } from "./mediaLibrary";
import { createCorrelationId } from "./telemetry";
import {
    cloneEmusicDocument,
    emptyEmusicDocument,
    emusicApiUrl,
    emusicCloudFileUrl,
    fetchEmusicForTrack,
    trackLyricsSlug,
    type EmusicDocument,
} from "./emusic";

export async function saveEmusicToCloud(
    slug: string,
    document: EmusicDocument,
): Promise<EmusicDocument> {
    const token = getAuthToken();
    if (!token) {
        throw new Error("Sign in to save .emusic to the cloud.");
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

async function cloudEmusicExists(slug: string): Promise<boolean> {
    try {
        const res = await fetch(emusicCloudFileUrl(slug), {
            method: "GET",
            headers: { Accept: "application/json" },
        });
        if (!res.ok) return false;
        const data = (await res.json()) as EmusicDocument;
        return data?.type === "emusic";
    } catch {
        return false;
    }
}

export type EnsureEmusicResult = {
    document: EmusicDocument;
    created: boolean;
    slug: string;
};

/**
 * Load .emusic for a track. If missing and the caller is APS admin, create an
 * empty v4 document, save it under media/emusic_files/{slug}.emusic, and return it.
 */
export async function ensureEmusicForTrack(objectKey: string): Promise<EnsureEmusicResult | null> {
    if (!objectKey || isLocalTrackKey(objectKey)) return null;
    const slug = trackLyricsSlug(objectKey);
    const existing = await fetchEmusicForTrack(objectKey);
    if (existing) {
        const doc = cloneEmusicDocument(existing);
        // Promote static /lyrics copies into S3 when admin opens them.
        if (isApsAdminEmail(getAuthEmailFromToken()) && !(await cloudEmusicExists(slug))) {
            const saved = await saveEmusicToCloud(slug, doc);
            return { document: saved, created: true, slug };
        }
        return { document: doc, created: false, slug };
    }

    if (!isApsAdminEmail(getAuthEmailFromToken())) return null;

    const trackFile = trackDisplayName(objectKey);
    const title = trackFile.replace(/\.mp3$/i, "");
    const blank = emptyEmusicDocument(trackFile, title);
    const saved = await saveEmusicToCloud(slug, blank);
    return { document: saved, created: true, slug };
}

/**
 * Ensure every library track has a cloud .emusic (admin only). Runs with limited concurrency.
 */
export async function ensureEmusicForLibrary(
    objectKeys: string[],
    onProgress?: (done: number, total: number, created: number) => void,
): Promise<{ checked: number; created: number }> {
    if (!isApsAdminEmail(getAuthEmailFromToken())) {
        return { checked: 0, created: 0 };
    }
    const keys = objectKeys.filter((key) => key && !isLocalTrackKey(key));
    let done = 0;
    let created = 0;
    const concurrency = 3;
    let cursor = 0;

    async function worker(): Promise<void> {
        while (cursor < keys.length) {
            const index = cursor;
            cursor += 1;
            const key = keys[index];
            try {
                const result = await ensureEmusicForTrack(key);
                if (result?.created) created += 1;
            } catch {
                // Keep going for the rest of the library.
            } finally {
                done += 1;
                onProgress?.(done, keys.length, created);
            }
        }
    }

    await Promise.all(
        Array.from({ length: Math.min(concurrency, keys.length) }, () => worker()),
    );
    return { checked: keys.length, created };
}
