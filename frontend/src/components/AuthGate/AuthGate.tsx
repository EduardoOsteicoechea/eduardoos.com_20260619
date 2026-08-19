/**
 * Client-side gate: redirect unauthenticated users off protected paths.
 * Admin-only paths require sign-in; non-admins stay so the page can show the
 * same denied UI as APS admin. Backend still returns 403 on /api/admin/*.
 */

import { useEffect } from "react";
import { APP_ROUTES } from "../../config/routes";
import { isAuthenticated } from "../../lib/auth";
import { isAdminOnlyPagePath, isPublicPagePath } from "../../lib/routeAccess";

interface AuthGateProps {
  pathname: string;
}

export function AuthGate({ pathname }: AuthGateProps) {
  useEffect(() => {
    if (isPublicPagePath(pathname)) return;

    if (isAdminOnlyPagePath(pathname)) {
      if (!isAuthenticated()) {
        const next = encodeURIComponent(pathname);
        window.location.replace(`${APP_ROUTES.login}?next=${next}`);
      }
      return;
    }

    if (isAuthenticated()) return;
    const next = encodeURIComponent(pathname);
    window.location.replace(`${APP_ROUTES.login}?next=${next}`);
  }, [pathname]);

  return null;
}

export default AuthGate;
