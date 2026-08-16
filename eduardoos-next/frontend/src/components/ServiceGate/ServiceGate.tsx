/**
 * Soft gate for billable services — admin always passes; others need entitlement.
 */

import { useEffect, useState, type ReactNode } from "react";
import { APP_ROUTES } from "../../config/routes";
import { isAuthenticated, isApsAdminEmail, getAuthEmailFromToken } from "../../lib/auth";
import {
  checkServiceAccess,
  fetchMyEntitlements,
  hasServiceAccess,
} from "../../lib/payments";
import "./ServiceGate.css";

interface ServiceGateProps {
  serviceId: string;
  serviceLabel: string;
  children: ReactNode;
}

export default function ServiceGate({
  serviceId,
  serviceLabel,
  children,
}: ServiceGateProps) {
  const [state, setState] = useState<"loading" | "ok" | "denied" | "signin">("loading");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!isAuthenticated()) {
        if (!cancelled) setState("signin");
        return;
      }
      if (isApsAdminEmail(getAuthEmailFromToken())) {
        if (!cancelled) setState("ok");
        return;
      }
      try {
        const remote = await checkServiceAccess(serviceId);
        if (cancelled) return;
        if (remote.allowed) {
          setState("ok");
          return;
        }
        const ents = await fetchMyEntitlements();
        if (cancelled) return;
        setState(hasServiceAccess(serviceId, ents) ? "ok" : "denied");
      } catch {
        if (!cancelled) setState("denied");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [serviceId]);

  if (state === "loading") {
    return <p className="service-gate__status">Checking subscription…</p>;
  }

  if (state === "signin") {
    return (
      <section className="service-gate">
        <h1 className="service-gate__title">{serviceLabel}</h1>
        <p className="service-gate__lead">Sign in to use this service.</p>
        <a
          className="btn btn--primary"
          href={`${APP_ROUTES.login}?next=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/")}`}
        >
          Sign in
        </a>
      </section>
    );
  }

  if (state === "denied") {
    return (
      <section className="service-gate">
        <h1 className="service-gate__title">{serviceLabel}</h1>
        <p className="service-gate__lead">
          This service requires an active subscription. Subscribe or ask an admin
          to grant access.
        </p>
        <div className="service-gate__actions">
          <a className="btn btn--primary" href={APP_ROUTES.subscription}>
            Subscribe
          </a>
          <a className="btn" href={APP_ROUTES.contact}>
            Contact
          </a>
        </div>
      </section>
    );
  }

  return <>{children}</>;
}
