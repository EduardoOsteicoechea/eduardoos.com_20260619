/**
 * /church/overview — linked church data, add activities, calendar.
 */

import { useEffect, useState, type FormEvent } from "react";
import { APP_ROUTES } from "../../config/routes";
import {
  churchDetailHref,
  createChurchActivity,
  fetchChurchOverview,
  leaderDisplayName,
  roleLabel,
  type OverviewPayload,
} from "../../lib/church";
import ChurchActivitiesCalendar from "./ChurchActivitiesCalendar";
import { ChurchGateShell, useChurchAuthGate } from "./ChurchGate";
import "./Church.css";

export default function ChurchOverviewPage() {
  const gate = useChurchAuthGate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [title, setTitle] = useState("");
  const [sector, setSector] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    setLoading(true);
    setError("");
    try {
      const ov = await fetchChurchOverview();
      setData(ov);
      if (!target && ov.churches.length > 0) {
        const c = ov.churches[0].church;
        setTarget(`${c.denominationId}/${c.churchId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load overview");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (gate !== "allowed") return;
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate]);

  const allActivities =
    data?.churches.flatMap((ch) =>
      ch.activities.map((a) => ({ ...a, _church: ch.church.name })),
    ) ?? [];

  const canAdd = (data?.churches ?? []).some(
    (ch) => ch.viewerRole === "church-admin" || ch.viewerRole === "admin",
  );

  async function onAddActivity(e: FormEvent) {
    e.preventDefault();
    if (!target || !title.trim()) return;
    const [denomId, churchId] = target.split("/");
    setBusy(true);
    try {
      await createChurchActivity(denomId, churchId, {
        title: title.trim(),
        sector: sector.trim(),
        startDate,
        endDate: endDate || startDate,
      });
      setTitle("");
      setSector("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add activity");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ChurchGateShell gate={gate}>
      <article className="church-page">
        <p className="church-page__brand">Church</p>
        <h1 className="church-page__title">Overview</h1>
        <p className="church-page__lead">
          Data for churches linked to your account. Church-admins see the full plan;
          members see only what they are authorized to see.
        </p>
        <div className="church-page__actions">
          <a className="btn" href={APP_ROUTES.church}>
            Grid
          </a>
          <a className="btn" href={APP_ROUTES.churchActivity}>
            Activities
          </a>
        </div>

        {loading ? <p className="church-empty">Loading overview…</p> : null}
        {error ? <p className="church-empty">{error}</p> : null}

        {!loading && data && data.churches.length === 0 ? (
          <p className="church-empty">
            No linked churches yet.{" "}
            <a href={APP_ROUTES.churchRegister}>Register one</a>.
          </p>
        ) : null}

        <ul className="church-list">
          {(data?.churches ?? []).map((ch) => (
            <li
              key={`${ch.church.denominationId}/${ch.church.churchId}`}
              className="church-list__item"
            >
              <h3>
                <a href={churchDetailHref(ch.church.denominationId, ch.church.churchId)}>
                  {ch.church.name}
                </a>
              </h3>
              <p className="church-card__meta">
                <span className="church-role">{roleLabel(ch.viewerRole)}</span>
                {" · "}
                {ch.activities.length} activities
                {ch.church.openedAt ? ` · apertura ${ch.church.openedAt}` : ""}
              </p>
              {ch.church.address ? (
                <p className="church-panel__block">{ch.church.address}</p>
              ) : null}
              {(ch.church.leaders ?? []).length > 0 ? (
                <p className="church-panel__block">
                  Liderazgo:{" "}
                  {(ch.church.leaders ?? [])
                    .map((L) => leaderDisplayName(L))
                    .filter(Boolean)
                    .join(", ")}
                </p>
              ) : null}
              {(ch.viewerRole === "church-admin" || ch.viewerRole === "admin") && (
                <p className="church-panel__block">
                  Plan: {ch.activities.map((a) => a.title).join(", ") || "—"}
                </p>
              )}
            </li>
          ))}
        </ul>

        {canAdd ? (
          <form className="church-form" onSubmit={onAddActivity}>
            <h2 style={{ margin: 0, fontFamily: "var(--font-display)" }}>Add activity</h2>
            <label>
              Church
              <select value={target} onChange={(e) => setTarget(e.target.value)} required>
                {(data?.churches ?? [])
                  .filter(
                    (ch) => ch.viewerRole === "church-admin" || ch.viewerRole === "admin",
                  )
                  .map((ch) => (
                    <option
                      key={`${ch.church.denominationId}/${ch.church.churchId}`}
                      value={`${ch.church.denominationId}/${ch.church.churchId}`}
                    >
                      {ch.church.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Title
              <input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </label>
            <label>
              Sector
              <input value={sector} onChange={(e) => setSector(e.target.value)} />
            </label>
            <label>
              Start date
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
            <label>
              End date
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? "Saving…" : "Add activity"}
            </button>
          </form>
        ) : null}

        <ChurchActivitiesCalendar activities={allActivities} />
      </article>
    </ChurchGateShell>
  );
}
