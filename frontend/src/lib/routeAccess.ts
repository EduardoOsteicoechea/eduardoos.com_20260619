import { APP_ROUTES } from "../config/routes";
export function isPublicPagePath(pathname: string): boolean {
    const path = normalizePath(pathname);
    if (path === "/") {
        return true;
    }
    if (path.startsWith("/auth/")) {
        return true;
    }
    if (path === normalizePath(APP_ROUTES.mediaPlaylist) ||
        path.startsWith(`${normalizePath(APP_ROUTES.mediaPlaylist)}/`) ||
        path === "/media/playlist" ||
        path.startsWith("/media/playlist/")) {
        return true;
    }
    // Panfleto editor is local-file based; no account required.
    if (path === normalizePath(APP_ROUTES.pamphlet) ||
        path.startsWith(`${normalizePath(APP_ROUTES.pamphlet)}/`) ||
        path === "/panfleto") {
        return true;
    }
    return false;
}
function normalizePath(pathname: string): string {
    if (!pathname) {
        return "/";
    }
    const trimmed = pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
    return trimmed || "/";
}
