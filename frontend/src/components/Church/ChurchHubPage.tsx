/**
 * /church — searchable grid of church cards.
 * Browse stays open to any signed-in user; register requires authz + sub.
 */

import { useEffect, useState, type FormEvent } from "react";
import { APP_ROUTES } from "../../config/routes";
import {
  churchDetailHref,
  fetchChurchAuthorization,
  listChurches,
  requestChurchAuthorization,
  type ChurchAuthorization,
  type ChurchCard,
} from "../../lib/church";
import {
  DashboardGrid,
  DashboardSection,
  ProductHubShell,
  type DashboardCardItem,
} from "../ProductDashboard/ProductDashboard";
import "../ProductDashboard/ProductDashboard.css";
import { ChurchGateShell, useChurchAuthGate } from "./ChurchGate";
import "./Church.css";

export default function ChurchHubPage() {
  const gate = useChurchAuthGate();
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [churches, setChurches] = useState<ChurchCard[]>([]);
  const [authz, setAuthz] = useState<ChurchAuthorization | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMsg, setAuthMsg] = useState("");

  async function load(query = q) {
    setLoading(true);
    setError("");
    try {
      const data = await listChurches(query);
      setChurches(data.churches ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load churches");
      setChurches([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadAuthz() {
    try {
      const data = await fetchChurchAuthorization();
      setAuthz(data);
    } catch {
      setAuthz(null);
    }
  }

  useEffect(() => {
    if (gate !== "allowed") return;
    void load("");
    void loadAuthz();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate]);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    void load(q);
  }

  async function onRequestAuthorization() {
    setAuthBusy(true);
    setAuthMsg("");
    try {
      await requestChurchAuthorization();
      setAuthMsg("Authorization requested. An admin will review it on Admin Users.");
      await loadAuthz();
    } catch (err) {
      setAuthMsg(err instanceof Error ? err.message : "Request failed");
    } finally {
      setAuthBusy(false);
    }
  }

  const canRegister = Boolean(authz?.isPlatformAdmin || authz?.canRegister);
  const showRequest =
    authz &&
    !authz.isPlatformAdmin &&
    (authz.authorizationStatus === "none" ||
      authz.authorizationStatus === "rejected");
  const showPending =
    authz && !authz.isPlatformAdmin && authz.authorizationStatus === "pending";
  const showSubscribe =
    authz &&
    !authz.isPlatformAdmin &&
    authz.authorizationStatus === "approved" &&
    !authz.hasChurchManagement;

  return (
    <ChurchGateShell gate={gate}>
      <ProductHubShell title="Church">
        <DashboardSection title="Workspace">
          <DashboardGrid
            cards={
              [
                {
                  id: "register",
                  title: "Register church",
                  description: "New iglesia under church/",
                  icon: "add_business",
                },
                {
                  id: "overview",
                  title: "My overview",
                  description: "Your church dashboard",
                  icon: "dashboard",
                },
                {
                  id: "activity",
                  title: "My activities",
                  description: "Activity feed",
                  icon: "timeline",
                },
                ...(authz?.isPlatformAdmin || authz?.canRegister
                  ? [
                      {
                        id: "leaders",
                        title: "Líderes",
                        description: "Leaders catalog",
                        icon: "supervisor_account",
                      },
                    ]
                  : []),
                ...(authz?.isPlatformAdmin
                  ? [
                      {
                        id: "groups",
                        title: "Redes / groups",
                        description: "Group networks",
                        icon: "hub",
                      },
                    ]
                  : []),
              ] as DashboardCardItem[]
            }
            onSelect={(id) => {
              const map: Record<string, string> = {
                register: APP_ROUTES.churchRegister,
                overview: APP_ROUTES.churchOverview,
                activity: APP_ROUTES.churchActivity,
                leaders: APP_ROUTES.churchLeaders,
                groups: APP_ROUTES.churchGroups,
              };
              if (map[id]) window.location.href = map[id];
            }}
          />
        </DashboardSection>

        <DashboardSection title="Browse">
        <p className="church-page__lead">
          Browse registered churches, open a detail page, or register a new iglesia
          under the S3 church/ prefix.
        </p>

        {showRequest ? (
          <div className="church-auth-banner">
            <p className="church-auth-banner__text">
              To register churches, request platform authorization first. After
              approval you subscribe to Church Management ($1/mo), then register.
            </p>
            <button
              type="button"
              className="btn btn--primary"
              disabled={authBusy}
              onClick={() => void onRequestAuthorization()}
            >
              {authBusy ? "Sending…" : "Request authorization"}
            </button>
            {authMsg ? <p className="church-auth-banner__msg">{authMsg}</p> : null}
          </div>
        ) : null}
        {showPending ? (
          <div className="church-auth-banner">
            <p className="church-auth-banner__text">
              Authorization request pending admin review.
            </p>
          </div>
        ) : null}
        {showSubscribe ? (
          <div className="church-auth-banner">
            <p className="church-auth-banner__text">
              You are approved. Subscribe to Church Management to unlock registration.
            </p>
            <a className="btn btn--primary" href={APP_ROUTES.subscription}>
              Subscribe
            </a>
          </div>
        ) : null}

        <form className="church-search" onSubmit={onSearch}>
          <input
            className="church-search__input"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search churches…"
            aria-label="Search churches"
          />
          <button type="submit" className="btn btn--primary">
            Search
          </button>
        </form>

        {loading ? <p className="church-empty">Loading churches…</p> : null}
        {error ? <p className="church-empty">{error}</p> : null}
        {!loading && !error && churches.length === 0 ? (
          <p className="church-empty">No churches found yet.</p>
        ) : null}

        <ul className="church-grid">
          {churches.map((c) => (
            <li key={`${c.denominationId}/${c.churchId}`}>
              <a
                className="church-card"
                href={churchDetailHref(c.denominationId, c.churchId)}
              >
                <h2 className="church-card__name">{c.name}</h2>
                <p className="church-card__meta">
                  {[c.network, c.denominationId, c.churchId].filter(Boolean).join(" · ")}
                </p>
              </a>
            </li>
          ))}
        </ul>
        </DashboardSection>
      </ProductHubShell>
    </ChurchGateShell>
  );
}
