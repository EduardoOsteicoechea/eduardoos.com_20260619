/**
 * Client-side gate: redirect unauthenticated users off protected paths.
 * Works with BaseLayout requireAuth for an early flash-prevention check.
 */

import { useEffect } from "react";
import { APP_ROUTES } from "../../config/routes";
import { getAuthToken } from "../../lib/auth";
import { isPublicPagePath } from "../../lib/routeAccess";

interface AuthGateProps {
  pathname: string;
}

export function AuthGate({ pathname }: AuthGateProps) {
  useEffect(() => {
    if (isPublicPagePath(pathname)) return;
    if (getAuthToken()) return;
    const next = encodeURIComponent(pathname);
    window.location.replace(`${APP_ROUTES.login}?next=${next}`);
  }, [pathname]);

  return null;
}

export default AuthGate;
