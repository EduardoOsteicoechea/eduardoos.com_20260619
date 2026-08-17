/**
 * /church/{denom}/{id} — tabbed church detail.
 */

import { useEffect, useState } from "react";
import { APP_ROUTES } from "../../config/routes";
import {
  fetchChurch,
  leaderRoleLabel,
  memberDisplayName,
  resolveChurchIdsFromLocation,
  roleLabel,
  type ChurchDetail,
} from "../../lib/church";
import { ChurchGateShell, useChurchAuthGate } from "./ChurchGate";
import "./Church.css";

type Tab = "info" | "beliefs" | "members" | "activities" | "network";

export default function ChurchDetailPage() {
  const gate = useChurchAuthGate();
  const [tab, setTab] = useState<Tab>("info");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<ChurchDetail | null>(null);

  useEffect(() => {
    if (gate !== "allowed") return;
    const { denomId, churchId } = resolveChurchIdsFromLocation();
    if (!denomId || !churchId) {
      setError("Missing church path.");
      setLoading(false);
      return;
    }
    void (async () => {
      setLoading(true);
      try {
        const data = await fetchChurch(denomId, churchId);
        setDetail(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load church");
      } finally {
        setLoading(false);
      }
    })();
  }, [gate]);

  return (
    <ChurchGateShell gate={gate}>
      <article className="church-page">
        <p className="church-page__brand">Church</p>
        {loading ? <p className="church-empty">Loading…</p> : null}
        {error ? <p className="church-empty">{error}</p> : null}
        {detail ? (
          <>
            <h1 className="church-page__title">{detail.church.name}</h1>
            <p className="church-page__lead">
              {detail.church.network || detail.church.denominationId} ·{" "}
              <span className="church-role">{roleLabel(detail.viewerRole)}</span>
            </p>
            <div className="church-page__actions">
              <a className="btn" href={APP_ROUTES.church}>
                Grid
              </a>
              <a className="btn" href={APP_ROUTES.churchOverview}>
                Overview
              </a>
            </div>

            <div className="church-tabs" role="tablist">
              {(
                [
                  ["info", "Info"],
                  ["beliefs", "Creencias"],
                  ["members", "Miembros"],
                  ["activities", "Actividades"],
                  ["network", "Red"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  className={`church-tabs__btn${tab === id ? " church-tabs__btn--active" : ""}`}
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="church-panel" role="tabpanel">
              {tab === "info" ? (
                <>
                  <h2>Líderes</h2>
                  <ul className="church-list">
                    {(detail.church.leaders ?? detail.church.pastors ?? []).length ===
                    0 ? (
                      <li className="church-empty">Sin líderes.</li>
                    ) : null}
                    {(detail.church.leaders ?? []).map((L) => (
                      <li key={L.name} className="church-list__item">
                        <h3>{L.name}</h3>
                        <p className="church-card__meta">
                          {(L.roles ?? []).map(leaderRoleLabel).join(" · ") || "—"}
                        </p>
                      </li>
                    ))}
                    {!detail.church.leaders?.length &&
                      (detail.church.pastors ?? []).map((p) => (
                        <li key={p} className="church-list__item">
                          {p}
                        </li>
                      ))}
                  </ul>
                  {detail.church.openedAt || detail.church.address ? (
                    <>
                      <h2>Local</h2>
                      <p className="church-panel__block">
                        {[
                          detail.church.openedAt
                            ? `Apertura: ${detail.church.openedAt}`
                            : "",
                          detail.church.address
                            ? `Dirección: ${detail.church.address}`
                            : "",
                        ]
                          .filter(Boolean)
                          .join("\n")}
                      </p>
                    </>
                  ) : null}
                  {(detail.church.sectorActivities ?? []).length > 0 ? (
                    <>
                      <h2>Actividades por sector</h2>
                      <ul className="church-list">
                        {detail.church.sectorActivities!.map((s) => (
                          <li key={s.sector} className="church-list__item">
                            <h3>{s.sector}</h3>
                            <p className="church-panel__block">{s.description}</p>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </>
              ) : null}

              {tab === "beliefs" ? (
                <p className="church-panel__block">
                  {detail.church.beliefsDocument || "No beliefs document yet."}
                </p>
              ) : null}

              {tab === "members" ? (
                <ul className="church-list">
                  {(detail.church.members ?? []).map((m) => (
                    <li key={m.email} className="church-list__item">
                      <h3>{memberDisplayName(m) || m.email}</h3>
                      <p className="church-card__meta">
                        {m.email} · {roleLabel(m.role)}
                        {m.phone ? ` · ${m.phone}` : ""}
                      </p>
                      {m.address ? (
                        <p className="church-panel__block">{m.address}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}

              {tab === "activities" ? (
                <ul className="church-list">
                  {detail.activities.length === 0 ? (
                    <li className="church-empty">No activities visible.</li>
                  ) : null}
                  {detail.activities.map((a) => (
                    <li key={a.id} className="church-list__item">
                      <h3>{a.title}</h3>
                      <p className="church-card__meta">
                        {[a.sector, a.startDate, a.endDate].filter(Boolean).join(" · ")}
                      </p>
                      {a.description ? (
                        <p className="church-panel__block">{a.description}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}

              {tab === "network" ? (
                <>
                  <p className="church-panel__block">
                    Denominación / web id: {detail.church.denominationId}
                  </p>
                  <p className="church-panel__block">
                    Network: {detail.church.network || "—"}
                  </p>
                  <h2>Iglesias locales</h2>
                  <ul className="church-list">
                    {(detail.church.localChurches ?? []).map((n) => (
                      <li key={n} className="church-list__item">
                        {n}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          </>
        ) : null}
      </article>
    </ChurchGateShell>
  );
}
