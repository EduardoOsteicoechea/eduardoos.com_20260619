export const ACTIVE_PAMPHLET_ID_KEY = "eduardoos-pamphlet-active-id";
export function readStoredPamphletId(): string | null {
    if (typeof localStorage === "undefined") {
        return null;
    }
    const id = localStorage.getItem(ACTIVE_PAMPHLET_ID_KEY)?.trim();
    return id || null;
}
export function persistActivePamphletId(pamphletId: string): void {
    if (typeof localStorage === "undefined") {
        return;
    }
    localStorage.setItem(ACTIVE_PAMPHLET_ID_KEY, pamphletId.trim());
}
