/**
 * Shared JWT gate for Church surfaces (any signed-in user).
 */

import { useEffect, useState, type ReactNode } from "react";
import { APP_ROUTES } from "../../config/routes";
import { isAuthenticated } from "../../lib/auth";
import "./Church.css";

type Gate = "checking" | "allowed" | "signin";

export function useChurchAuthGate(): Gate {
  const [gate, setGate] = useState<Gate>("checking");

  useEffect(() => {
    if (!isAuthenticated()) {
      setGate("signin");
      return;
    }
    setGate("allowed");
  }, []);

  return gate;
}

export function ChurchGateShell({
  gate,
  children,
}: {
  gate: Gate;
  children: ReactNode;
}) {
  if (gate === "checking") {
    return (
      <div className="church-gate">
        <p className="church-gate__text">Checking access…</p>
      </div>
    );
  }
  if (gate === "signin") {
    return (
      <div className="church-gate">
        <h1 className="church-gate__title">Church</h1>
        <p className="church-gate__text">Sign in to browse and manage churches.</p>
        <a className="btn btn--primary" href={APP_ROUTES.login}>
          Sign in
        </a>
      </div>
    );
  }
  return <>{children}</>;
}
