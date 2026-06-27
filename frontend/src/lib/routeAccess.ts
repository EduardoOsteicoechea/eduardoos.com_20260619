/**
 * routeAccess.ts — Public vs authenticated frontend page paths.
 */
import { APP_ROUTES } from "../config/routes";

/** Pages reachable without a stored JWT (home, auth flow, worship playlist). */
export function isPublicPagePath(pathname: string): boolean {
  const path = normalizePath(pathname);
  if (path === "/") {
    return true;
  }
  if (path.startsWith("/auth/")) {
    return true;
  }
  if (path === normalizePath(APP_ROUTES.mediaPlaylist) || path.startsWith(`${normalizePath(APP_ROUTES.mediaPlaylist)}/`)) {
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
