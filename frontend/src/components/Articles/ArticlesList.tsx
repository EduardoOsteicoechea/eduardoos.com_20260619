import { useEffect, useState } from "react";
import { APP_ROUTES, ARTICLE_ROUTES } from "../../config/routes";
import { fetchArticles, type ArticlesListResponse } from "../../lib/articles";
import type { EpamRecord } from "../../lib/epams";
import "./Articles.css";

/**
 * Visually hidden crawl discovery — clipped from the viewport but still in the
 * DOM so AI/search crawlers can follow HTML / text / JSON / llms.txt.
 */
function CrawlOnlyLinks({ items }: { items: EpamRecord[] }) {
  return (
    <nav className="articles-crawl-only" aria-hidden="true" data-crawl="articles">
      <a href={ARTICLE_ROUTES.indexHtml}>Articles HTML index</a>
      <a href={ARTICLE_ROUTES.list}>Articles JSON</a>
      <a href="/llms.txt">llms.txt</a>
      {items.map((item) => (
        <span key={item.epamId}>
          <a href={ARTICLE_ROUTES.html(item.epamId)}>
            {item.title || item.fileName || item.epamId} HTML
          </a>
          <a href={ARTICLE_ROUTES.text(item.epamId)}>
            {item.title || item.fileName || item.epamId} text
          </a>
          <a href={ARTICLE_ROUTES.item(item.epamId)}>
            {item.title || item.fileName || item.epamId} JSON
          </a>
        </span>
      ))}
    </nav>
  );
}

export default function ArticlesList() {
  const [items, setItems] = useState<EpamRecord[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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

  return (
    <div className="articles">
      <header className="articles__header">
        <h1 className="articles__title">Articles</h1>
        <p className="articles__lead">
          Pamphlets in continuous reading order.
        </p>
      </header>
      {loading && <p className="articles__status">Loading…</p>}
      {error && <p className="articles__error">{error}</p>}
      {!loading && !error && items.length === 0 && (
        <p className="articles__status">
          No public pamphlets yet. Save one from{" "}
          <a href={APP_ROUTES.pamphlet}>Pamphlet</a> under the public articles
          account.
        </p>
      )}
      <ul className="articles__list">
        {items.map((item) => (
          <li key={item.epamId}>
            <a className="articles__card" href={APP_ROUTES.article(item.epamId)}>
              <span className="articles__card-title">
                {item.title || item.fileName || "Untitled"}
              </span>
              <span className="articles__card-meta">
                {[item.author, item.series, item.seriesChapter, item.date]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </a>
          </li>
        ))}
      </ul>
      <CrawlOnlyLinks items={items} />
    </div>
  );
}
