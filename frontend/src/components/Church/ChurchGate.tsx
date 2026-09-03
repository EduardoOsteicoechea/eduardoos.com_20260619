/**
 * Shared JWT gate for Church surfaces (any signed-in user for browse).
 * Register uses useChurchRegisterGate (admin approval + church-management).
 */

import { useEffect, useState, type ReactNode } from "react";
import { APP_ROUTES } from "../../config/routes";
import { isAuthenticated } from "../../lib/auth";
import {
  fetchChurchAuthorization,
  requestChurchAuthorization,
  type ChurchAuthorization,
} from "../../lib/church";
import { ViewLoading } from "../ViewLoading/ViewLoading";
import "./Church.css";

type Gate = "checking" | "allowed" | "signin";

export type RegisterGate =
  | "checking"
  | "signin"
  | "allowed"
  | "need_request"
  | "pending"
  | "rejected"
  | "need_subscription"
  | "error";

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

/** Register: platform admin OR (approved + active church-management). */
export function useChurchRegisterGate(): {
  gate: RegisterGate;
  auth: ChurchAuthorization | null;
  refresh: () => Promise<void>;
  requestAccess: () => Promise<void>;
  busy: boolean;
  error: string;
} {
  const [gate, setGate] = useState<RegisterGate>("checking");
  const [auth, setAuth] = useState<ChurchAuthorization | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    if (!isAuthenticated()) {
      setGate("signin");
      setAuth(null);
      return;
    }
    setError("");
    try {
      const data = await fetchChurchAuthorization();
      setAuth(data);
      if (data.isPlatformAdmin || data.canRegister) {
        setGate("allowed");
        return;
      }
      switch (data.authorizationStatus) {
        case "pending":
          setGate("pending");
          break;
        case "rejected":
          setGate("rejected");
          break;
        case "approved":
          setGate(data.hasChurchManagement ? "allowed" : "need_subscription");
          break;
        default:
          setGate("need_request");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check authorization");
      setGate("error");
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function requestAccess() {
    setBusy(true);
    setError("");
    try {
      await requestChurchAuthorization();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return { gate, auth, refresh, requestAccess, busy, error };
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
        <ViewLoading label="Checking access" />
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

export function ChurchRegisterGateShell({
  gate,
  busy,
  error,
  onRequest,
  children,
}: {
  gate: RegisterGate;
  busy: boolean;
  error: string;
  onRequest: () => void;
  children: ReactNode;
}) {
  if (gate === "checking") {
    return (
      <div className="church-gate">
        <ViewLoading label="Checking authorization" />
      </div>
    );
  }
  if (gate === "signin") {
    return (
      <div className="church-gate">
        <h1 className="church-gate__title">Register church</h1>
        <p className="church-gate__text">
          Sign in, request platform authorization, then subscribe to Church Management.
        </p>
        <a className="btn btn--primary" href={APP_ROUTES.login}>
          Sign in
        </a>
      </div>
    );
  }
  if (gate === "need_request" || gate === "rejected") {
    return (
      <div className="church-gate">
        <h1 className="church-gate__title">Authorization required</h1>
        <p className="church-gate__text">
          {gate === "rejected"
            ? "Your previous request was rejected. You may request authorization again."
            : "Before you can register a church, a platform administrator must approve your request. After approval you will subscribe to Church Management ($1/mo), then register."}
        </p>
        {error ? <p className="church-gate__error">{error}</p> : null}
        <div className="church-page__actions">
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy}
            onClick={onRequest}
          >
            {busy ? "Sending…" : "Request authorization"}
          </button>
          <a className="btn" href={APP_ROUTES.church}>
            Back to Church
          </a>
        </div>
      </div>
    );
  }
  if (gate === "pending") {
    return (
      <div className="church-gate">
        <h1 className="church-gate__title">Request pending</h1>
        <p className="church-gate__text">
          Your authorization request is waiting for platform admin approval on Admin
          Users. You will receive an email when approved with the next subscription step.
        </p>
        <a className="btn" href={APP_ROUTES.church}>
          Back to Church
        </a>
      </div>
    );
  }
  if (gate === "need_subscription") {
    return (
      <div className="church-gate">
        <h1 className="church-gate__title">Subscribe to register</h1>
        <p className="church-gate__text">
          You are approved to manage churches. Activate the Church Management
          subscription ($1/month), then return here to register.
        </p>
        <div className="church-page__actions">
          <a className="btn btn--primary" href={APP_ROUTES.subscription}>
            Subscribe — Church Management
          </a>
          <a className="btn" href={APP_ROUTES.church}>
            Back to Church
          </a>
        </div>
      </div>
    );
  }
  if (gate === "error") {
    return (
      <div className="church-gate">
        <h1 className="church-gate__title">Could not verify access</h1>
        <p className="church-gate__text">{error || "Try again shortly."}</p>
        <a className="btn" href={APP_ROUTES.church}>
          Back to Church
        </a>
      </div>
    );
  }
  return <>{children}</>;
}
