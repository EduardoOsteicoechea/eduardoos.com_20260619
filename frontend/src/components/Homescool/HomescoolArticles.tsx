import { useEffect, useState } from "react";
import { APP_ROUTES } from "../../config/routes";
import { isAuthenticated } from "../../lib/auth";
import { fetchArticles, type ArticlesListResponse } from "../../lib/articles";
import type { EpamRecord } from "../../lib/epams";
import "./HomescoolArticles.css";

/**
 * Lists pamphlet-backed articles for Homescool.
 * Requires the same signed-in session as /articulos (API is authenticated).
 */
export default function HomescoolArticles() {
  const [items, setItems] = useState<EpamRecord[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [needsAuth, setNeedsAuth] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      setNeedsAuth(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res: ArticlesListResponse = await fetchArticles();
        if (!cancelled) setItems(res.articles ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loginHref = `${APP_ROUTES.login}?next=${encodeURIComponent(APP_ROUTES.homescool)}`;

  return (
    <section className="homescool-articles" aria-labelledby="homescool-articles-title">
      <h2 id="homescool-articles-title" className="homescool-articles__title">
        Articles
      </h2>
      <p className="homescool-articles__lead">
        Content published from pamphlets stored in the cloud: continuous reading, a quiz, and
        margin questions.
      </p>

      {needsAuth && (
        <>
          <p className="homescool-articles__status">
            Sign in to see articles published from Pamphlet.
          </p>
          <a className="btn btn--primary homescool-articles__cta" href={loginHref}>
            Sign in
          </a>
        </>
      )}

      {!needsAuth && loading && <p className="homescool-articles__status">Loading…</p>}
      {!needsAuth && error && <p className="homescool-articles__error">{error}</p>}
      {!needsAuth && !loading && !error && items.length === 0 && (
        <p className="homescool-articles__status">
          No pamphlets in the cloud yet. Save one from{" "}
          <a href={APP_ROUTES.pamphlet} data-astro-reload>
            Pamphlet
          </a>
          .
        </p>
      )}

      {!needsAuth && items.length > 0 && (
        <ul className="homescool-articles__list">
          {items.map((item) => (
            <li key={item.epamId}>
              <a className="homescool-articles__card" href={APP_ROUTES.article(item.epamId)}>
                <span className="homescool-articles__card-title">
                  {item.title || item.fileName || "Untitled"}
                </span>
                <span className="homescool-articles__card-meta">
                  {[item.author, item.series, item.seriesChapter, item.date]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
