/**
 * Client-side gate: redirect unauthenticated users off protected paths.
 * Uses the same expiry-aware check as the rest of Next auth (not raw token presence).
 */

import { useEffect } from "react";
import { APP_ROUTES } from "../../config/routes";
import { isAuthenticated } from "../../lib/auth";
import { isPublicPagePath } from "../../lib/routeAccess";

interface AuthGateProps {
  pathname: string;
}

export function AuthGate({ pathname }: AuthGateProps) {
  useEffect(() => {
    if (isPublicPagePath(pathname)) return;
    if (isAuthenticated()) return;
    const next = encodeURIComponent(pathname);
    window.location.replace(`${APP_ROUTES.login}?next=${next}`);
  }, [pathname]);

  return null;
}

export default AuthGate;
