/**
 * Which page paths are public without a JWT.
 * Protected: /bim, /aps-admin (and any future private surfaces).
 * Pamphlet editor stub stays public (local-file workflow).
 */

import { APP_ROUTES } from "../config/routes";

function normalizePath(pathname: string): string {
  if (!pathname) return "/";
  const trimmed =
    pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  return trimmed || "/";
}

export function isPublicPagePath(pathname: string): boolean {
  const path = normalizePath(pathname);

  if (path === "/") return true;
  if (path.startsWith("/auth/")) return true;
  if (path === normalizePath(APP_ROUTES.contact)) return true;
  if (path === normalizePath(APP_ROUTES.homescool)) return true;
  if (path === normalizePath(APP_ROUTES.articles) || path.startsWith("/articulos/")) {
    return true;
  }
  if (path === normalizePath(APP_ROUTES.edebat)) return true;
  if (path === normalizePath(APP_ROUTES.subscription)) return true;
  if (path === normalizePath(APP_ROUTES.mediaGallery)) return true;
  if (
    path === normalizePath(APP_ROUTES.mediaPlaylist) ||
    path.startsWith(`${normalizePath(APP_ROUTES.mediaPlaylist)}/`)
  ) {
    return true;
  }
  if (
    path === normalizePath(APP_ROUTES.pamphlet) ||
    path.startsWith(`${normalizePath(APP_ROUTES.pamphlet)}/`)
  ) {
    return true;
  }

  return false;
}
