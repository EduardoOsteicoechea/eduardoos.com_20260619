/**
 * Admin gate + Greek hub entry.
 */

import { useEffect, useState, type ReactNode } from "react";
import { APP_ROUTES } from "../../config/routes";
import { isAuthenticated, isPlatformAdmin } from "../../lib/auth";
import "./Greek.css";

type Gate = "checking" | "allowed" | "denied" | "signin";

export function useGreekAdminGate(): Gate {
  const [gate, setGate] = useState<Gate>("checking");

  useEffect(() => {
    const unlock = window.setTimeout(() => {
      setGate((prev) => (prev === "checking" ? "denied" : prev));
    }, 1500);
    if (!isAuthenticated()) {
      setGate("signin");
      window.clearTimeout(unlock);
      return;
    }
    setGate(isPlatformAdmin() ? "allowed" : "denied");
    window.clearTimeout(unlock);
    return () => window.clearTimeout(unlock);
  }, []);

  return gate;
}

export function GreekGateShell({
  gate,
  children,
}: {
  gate: Gate;
  children: ReactNode;
}) {
  if (gate === "checking") {
    return (
      <div className="greek-gate">
        <p className="greek-gate__text">Checking access…</p>
      </div>
    );
  }
  if (gate === "signin") {
    return (
      <div className="greek-gate">
        <h1 className="greek-gate__title">Greek</h1>
        <p className="greek-gate__text">Sign in as platform admin to continue.</p>
        <a className="btn btn--primary" href={APP_ROUTES.login}>
          Sign in
        </a>
      </div>
    );
  }
  if (gate === "denied") {
    return (
      <div className="greek-gate">
        <h1 className="greek-gate__title">Admin only</h1>
        <p className="greek-gate__text">
          Greek is limited to platform admins for now.
        </p>
        <a className="btn" href={APP_ROUTES.home}>
          Home
        </a>
      </div>
    );
  }
  return <>{children}</>;
}

export default function GreekHubPage() {
  const gate = useGreekAdminGate();

  return (
    <GreekGateShell gate={gate}>
      <article className="greek-page">
        <p className="greek-page__brand">Services</p>
        <h1 className="greek-page__title">Greek</h1>
        <p className="greek-page__lead">
          Copy and visualize entire books letter by letter — chapters, verses,
          and words as 32×64 SVG glyphs with bilingual glosses.
        </p>
        <div className="product-page__cta-row">
          <a className="btn btn--primary" href={APP_ROUTES.greekBuild}>
            Open builder
          </a>
        </div>
        <ul className="product-page__list">
          <li>Groups are books stored under S3 <code>greek/…</code></li>
          <li>Hierarchy: chapter → verse → word → letter images</li>
          <li>
            Letter catalog: seed Koine Αα…Ωω (fixed alphabet #), draw each SVG,
            then pick into words
          </li>
          <li>Admin only (role <code>admin</code> or bootstrap email)</li>
        </ul>
      </article>
    </GreekGateShell>
  );
}
