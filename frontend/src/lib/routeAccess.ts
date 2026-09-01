/**
 * Which page paths are public without a JWT.
 * Subscription-gated product surfaces require sign-in (entitlement checked in-page).
 * Admin users dashboard is never public — admin-only.
 */

import { APP_ROUTES } from "../config/routes";

function normalizePath(pathname: string): string {
  if (!pathname) return "/";
  const trimmed =
    pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  return trimmed || "/";
}

/** Platform-admin-only surfaces (IsAdminEmail allowlist on the client). */
export function isAdminOnlyPagePath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return (
    path === normalizePath(APP_ROUTES.adminUsers) ||
    path.startsWith(`${normalizePath(APP_ROUTES.adminUsers)}/`) ||
    path === normalizePath(APP_ROUTES.agentSandbox) ||
    path.startsWith(`${normalizePath(APP_ROUTES.agentSandbox)}/`)
  );
}

export function isPublicPagePath(pathname: string): boolean {
  const path = normalizePath(pathname);

  if (isAdminOnlyPagePath(path)) return false;

  if (path === "/") return true;
  if (path.startsWith("/auth/")) return true;
  if (path === normalizePath(APP_ROUTES.contact)) return true;
  if (path === normalizePath(APP_ROUTES.articles) || path.startsWith("/articulos/")) {
    return true;
  }
  if (
    path === normalizePath(APP_ROUTES.calvinsInstitutes) ||
    path.startsWith(`${normalizePath(APP_ROUTES.calvinsInstitutes)}/`)
  ) {
    return true;
  }
  if (
    path === normalizePath(APP_ROUTES.bimIfcViewer) ||
    path.startsWith(`${normalizePath(APP_ROUTES.bimIfcViewer)}/`)
  ) {
    return true;
  }
  if (path === normalizePath(APP_ROUTES.subscription)) return true;

  return false;
}

/** Maps app routes to billable service ids (admin bypasses). */
export function serviceIdForPath(pathname: string): string | null {
  const path = normalizePath(pathname);
  if (
    path === normalizePath(APP_ROUTES.mediaPlaylist) ||
    path.startsWith(`${normalizePath(APP_ROUTES.mediaPlaylist)}/`)
  ) {
    return "playlist";
  }
  if (
    path === normalizePath(APP_ROUTES.pamphlet) ||
    path.startsWith(`${normalizePath(APP_ROUTES.pamphlet)}/`)
  ) {
    return "pamphlet";
  }
  if (
    path === normalizePath(APP_ROUTES.homescool) ||
    path.startsWith(`${normalizePath(APP_ROUTES.homescool)}/`)
  ) {
    return "homescool";
  }
  if (
    path === normalizePath(APP_ROUTES.scrib) ||
    path.startsWith(`${normalizePath(APP_ROUTES.scrib)}/`)
  ) {
    return "scrib";
  }
  if (
    path === normalizePath(APP_ROUTES.ereport) ||
    path.startsWith(`${normalizePath(APP_ROUTES.ereport)}/`)
  ) {
    return "ereport";
  }
  if (
    path === normalizePath(APP_ROUTES.evoice) ||
    path.startsWith(`${normalizePath(APP_ROUTES.evoice)}/`)
  ) {
    return "evoice";
  }
  if (path === normalizePath(APP_ROUTES.churchRegister)) {
    return "church-management";
  }
  return null;
}
