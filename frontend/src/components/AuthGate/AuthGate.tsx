/**
 * AuthGate.tsx — Redirects unauthenticated visitors away from protected pages.
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
    if (isPublicPagePath(pathname)) {
      return;
    }
    if (getAuthToken()) {
      return;
    }
    const next = encodeURIComponent(pathname);
    window.location.replace(`${APP_ROUTES.login}?next=${next}`);
  }, [pathname]);

  return null;
}
