/**
 * /church — searchable grid of church cards.
 */

import { useEffect, useState, type FormEvent } from "react";
import { APP_ROUTES } from "../../config/routes";
import {
  churchDetailHref,
  listChurches,
  type ChurchCard,
} from "../../lib/church";
import { ChurchGateShell, useChurchAuthGate } from "./ChurchGate";
import "./Church.css";

export default function ChurchHubPage() {
  const gate = useChurchAuthGate();
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [churches, setChurches] = useState<ChurchCard[]>([]);

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

  useEffect(() => {
    if (gate !== "allowed") return;
    void load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate]);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    void load(q);
  }

  return (
    <ChurchGateShell gate={gate}>
      <article className="church-page">
        <p className="church-page__brand">Services</p>
        <h1 className="church-page__title">Church</h1>
        <p className="church-page__lead">
          Browse registered churches, open a detail page, or register a new iglesia
          under the S3 church/ prefix.
        </p>
        <div className="church-page__actions">
          <a className="btn btn--primary" href={APP_ROUTES.churchRegister}>
            Register church
          </a>
          <a className="btn" href={APP_ROUTES.churchOverview}>
            My overview
          </a>
          <a className="btn" href={APP_ROUTES.churchActivity}>
            My activities
          </a>
        </div>

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
      </article>
    </ChurchGateShell>
  );
}
