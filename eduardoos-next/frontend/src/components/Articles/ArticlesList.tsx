import { useEffect, useState } from "react";
import { APP_ROUTES, ARTICLE_ROUTES } from "../../config/routes";
import { fetchArticles, type ArticlesListResponse } from "../../lib/articles";
import type { EpamRecord } from "../../lib/epams";
import "./Articles.css";

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
          Pamphlets in continuous reading order — public for people and AI
          crawlers (ChatGPT, Claude, Gemini, Perplexity).
        </p>
        <p className="articles__crawl">
          Machine index:{" "}
          <a href={ARTICLE_ROUTES.indexHtml}>HTML</a>
          {" · "}
          <a href={ARTICLE_ROUTES.list}>JSON</a>
          {" · "}
          <a href="/llms.txt">llms.txt</a>
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
            <p className="articles__card-formats">
              <a href={ARTICLE_ROUTES.html(item.epamId)}>HTML</a>
              {" · "}
              <a href={ARTICLE_ROUTES.text(item.epamId)}>text</a>
              {" · "}
              <a href={ARTICLE_ROUTES.item(item.epamId)}>JSON</a>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
