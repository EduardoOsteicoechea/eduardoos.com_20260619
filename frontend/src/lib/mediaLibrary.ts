import { apiRequest } from "./api";
import { getAuthToken } from "./auth";
import { MEDIA_ROUTES } from "../config/routes";
import { createCorrelationId } from "./telemetry";
export const WORSHIP_AUDIO_PREFIX = "worship_playlists";
export interface AudioLibraryItem {
    key: string;
    name: string;
    content_type: string;
    size: number;
    size_human?: string;
    last_modified?: string;
    url: string;
    s3_url?: string;
}
interface AudioListResponse {
    prefix: string;
    count: number;
    tracks: AudioLibraryItem[];
}

interface AudioUploadResponse {
    track: AudioLibraryItem;
    prefix?: string;
}

export async function fetchAudioLibrary(): Promise<AudioLibraryItem[]> {
    const correlationId = createCorrelationId();
    const path = MEDIA_ROUTES.audioList(WORSHIP_AUDIO_PREFIX);
    const result = await apiRequest<AudioListResponse>(path, { correlationId });
    if (result.error) {
        throw new Error(result.error.message);
    }
    return result.data?.tracks ?? [];
}

/**
 * Upload a recorded (or picked) audio blob to S3 via the admin-only endpoint.
 * Returns the library track so PlaylistBuilder can append it immediately.
 */
export async function uploadWorshipRecording(
    blob: Blob,
    options: { title?: string; filename?: string; prefix?: string } = {},
): Promise<AudioLibraryItem> {
    const token = getAuthToken();
    if (!token) {
        throw new Error("Sign in as admin to upload recordings.");
    }
    const correlationId = createCorrelationId();
    const ext = extensionForAudioBlob(blob, options.filename);
    const filename = (options.filename?.trim() || `recording${ext}`).replace(/[/\\]/g, "-");
    const form = new FormData();
    form.append("file", blob, filename);
    if (options.title?.trim()) {
        form.append("title", options.title.trim());
    }
    form.append("prefix", options.prefix?.trim() || WORSHIP_AUDIO_PREFIX);

    const response = await fetch(MEDIA_ROUTES.audioUpload, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "X-Correlation-ID": correlationId,
        },
        body: form,
    });
    const text = await response.text();
    let data: AudioUploadResponse & { message?: string; error?: string } | undefined;
    if (text) {
        try {
            data = JSON.parse(text) as typeof data;
        } catch {
            data = undefined;
        }
    }
    if (!response.ok) {
        throw new Error(data?.message ?? data?.error ?? response.statusText ?? "Upload failed");
    }
    if (!data?.track?.key) {
        throw new Error("Empty audio upload response");
    }
    return data.track;
}

/**
 * Admin soft-delete: remove the track from the library listing only.
 * The S3 audio object is retained (backend never calls DeleteObject on it).
 */
export async function removeWorshipLibraryTrack(
    key: string,
    prefix: string = WORSHIP_AUDIO_PREFIX,
): Promise<{ key: string; retained_on_s3: boolean }> {
    const token = getAuthToken();
    if (!token) {
        throw new Error("Sign in as admin to remove library tracks.");
    }
    const correlationId = createCorrelationId();
    const result = await apiRequest<{
        removed?: boolean;
        key?: string;
        retained_on_s3?: boolean;
    }>(MEDIA_ROUTES.audioLibraryRemove, {
        method: "DELETE",
        authToken: token,
        correlationId,
        body: { key, prefix },
    });
    if (result.error) {
        throw new Error(result.error.message);
    }
    if (!result.data?.key) {
        throw new Error("Empty library remove response");
    }
    return {
        key: result.data.key,
        retained_on_s3: Boolean(result.data.retained_on_s3),
    };
}

/** Pick a file extension for MediaRecorder blobs (usually audio/webm). */
export function extensionForAudioBlob(blob: Blob, filenameHint?: string): string {
    const fromName = filenameHint?.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase();
    if (fromName && /^\.(webm|mp3|wav|ogg|m4a|aac|flac)$/.test(fromName)) {
        return fromName;
    }
    const type = (blob.type || "").toLowerCase();
    if (type.includes("webm")) return ".webm";
    if (type.includes("mpeg") || type.includes("mp3")) return ".mp3";
    if (type.includes("wav")) return ".wav";
    if (type.includes("ogg")) return ".ogg";
    if (type.includes("mp4") || type.includes("m4a") || type.includes("aac")) return ".m4a";
    if (type.includes("flac")) return ".flac";
    return ".webm";
}

function encodePathSegment(segment: string): string {
    let out = "";
    for (const ch of segment) {
        const code = ch.codePointAt(0)!;
        const isAlphaNum = (code >= 0x41 && code <= 0x5a) ||
            (code >= 0x61 && code <= 0x7a) ||
            (code >= 0x30 && code <= 0x39);
        const isAllowed = isAlphaNum ||
            ch === "-" ||
            ch === "_" ||
            ch === "." ||
            ch === "~" ||
            ch === "$" ||
            ch === "&" ||
            ch === "+" ||
            ch === "," ||
            ch === ":" ||
            ch === ";" ||
            ch === "=" ||
            ch === "?" ||
            ch === "@";
        if (isAllowed) {
            out += ch;
            continue;
        }
        for (const byte of new TextEncoder().encode(ch)) {
            out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
        }
    }
    return out;
}
export function encodeMediaRelativePath(relative: string): string {
    return relative
        .split("/")
        .filter((segment) => segment.length > 0)
        .map((segment) => encodePathSegment(segment))
        .join("/");
}
export function mediaObjectPlaybackUrl(objectKey: string, playbackUrl?: string): string {
    if (playbackUrl) {
        return normalizeMediaPlaybackUrl(playbackUrl);
    }
    const mediaPrefix = "media/";
    const relative = objectKey.startsWith(mediaPrefix)
        ? objectKey.slice(mediaPrefix.length)
        : objectKey;
    return `/api/media/file/${encodeMediaRelativePath(relative)}`;
}
export function normalizeMediaPlaybackUrl(url: string): string {
    const prefix = "/api/media/file/";
    if (!url.startsWith(prefix)) {
        return url;
    }
    return prefix + url.slice(prefix.length).replace(/%2F/gi, "/");
}
export function trackDisplayName(objectKey: string): string {
    const parts = objectKey.split("/");
    return parts[parts.length - 1] || objectKey;
}

/** Session-only local uploads use this prefix and are never persisted to playlists. */
export const LOCAL_TRACK_PREFIX = "local:";

export function isLocalTrackKey(objectKey: string): boolean {
    return objectKey.startsWith(LOCAL_TRACK_PREFIX);
}

export function makeLocalTrackKey(fileName: string): string {
    const safe = fileName.trim() || "audio.mp3";
    return `${LOCAL_TRACK_PREFIX}${crypto.randomUUID()}/${safe}`;
}

export function persistableTrackIds(trackIds: string[]): string[] {
    return trackIds.filter((key) => key && !isLocalTrackKey(key));
}

/**
 * True when a cached/fetched blob can be used as <audio src>.
 * Stale IndexedDB entries sometimes store JSON/HTML error bodies.
 */
export function isPlayableAudioBlob(blob: { type?: string; size: number } | null | undefined): boolean {
    if (!blob || !Number.isFinite(blob.size) || blob.size < 64) {
        return false;
    }
    const type = (blob.type || "").toLowerCase().split(";")[0].trim();
    if (!type || type === "application/octet-stream" || type === "binary/octet-stream") {
        return blob.size > 1024;
    }
    if (type.startsWith("audio/") || type === "application/ogg") {
        return true;
    }
    return false;
}
