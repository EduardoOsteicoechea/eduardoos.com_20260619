/**
 * Offline cache for .emusic lyric documents (paired with offline audio blobs).
 */
import localforage from "localforage";
import { cloneEmusicDocument, type EmusicDocument } from "./emusic";

const emusicStore = localforage.createInstance({
    name: "EduardoOS_Audio",
    storeName: "offline_emusic",
});

const catalogStore = localforage.createInstance({
    name: "EduardoOS_Audio",
    storeName: "offline_catalog",
});

const CATALOG_KEY = "library";

export interface OfflineLibraryItem {
    key: string;
    name: string;
    content_type: string;
    size: number;
    url: string;
}

export async function saveEmusicOffline(
    trackKey: string,
    document: EmusicDocument,
): Promise<void> {
    if (!trackKey) return;
    await emusicStore.setItem(trackKey, cloneEmusicDocument(document));
}

export async function getEmusicOffline(trackKey: string): Promise<EmusicDocument | null> {
    if (!trackKey) return null;
    const doc = await emusicStore.getItem<EmusicDocument>(trackKey);
    if (!doc || doc.type !== "emusic") return null;
    return cloneEmusicDocument(doc);
}

export async function saveOfflineLibraryCatalog(items: OfflineLibraryItem[]): Promise<void> {
    await catalogStore.setItem(CATALOG_KEY, items);
}

export async function getOfflineLibraryCatalog(): Promise<OfflineLibraryItem[]> {
    const items = await catalogStore.getItem<OfflineLibraryItem[]>(CATALOG_KEY);
    return Array.isArray(items) ? items : [];
}
