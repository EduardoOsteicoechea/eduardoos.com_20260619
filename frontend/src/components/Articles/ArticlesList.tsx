import { useEffect, useMemo, useState } from "react";
import { APP_ROUTES, ARTICLE_ROUTES } from "../../config/routes";
import { fetchArticles, type ArticlesListResponse } from "../../lib/articles";
import type { EpamRecord } from "../../lib/epams";
import { groupEpamsBySeries } from "../../lib/seriesTree";
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

function ArticleCard({ item }: { item: EpamRecord | { epamId: string; title: string; author?: string; date?: string } }) {
  return (
    <a className="articles__card" href={APP_ROUTES.article(item.epamId)}>
      <span className="articles__card-title">{item.title || "Untitled"}</span>
      <span className="articles__card-meta">
        {[
          "author" in item ? item.author : undefined,
          "date" in item ? item.date : undefined,
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </a>
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

  const tree = useMemo(() => groupEpamsBySeries(items), [items]);

  return (
    <div className="articles">
      <header className="articles__header">
        <h1 className="articles__title">Articles</h1>
        <p className="articles__lead">
          Pamphlets grouped by series and chapter. Expand or collapse a heading
          to browse.
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
      <div className="articles__tree">
        {tree.series.map((series) => (
          <details key={series.name} className="articles__series" open>
            <summary className="articles__series-title">{series.name}</summary>
            {series.chapters.map((chapter) => (
              <details key={chapter.name} className="articles__chapter" open>
                <summary className="articles__chapter-title">{chapter.name}</summary>
                <ul className="articles__list">
                  {chapter.items.map((item) => {
                    const full = items.find((row) => row.epamId === item.epamId);
                    return (
                      <li key={item.epamId}>
                        <ArticleCard
                          item={
                            full ?? {
                              epamId: item.epamId,
                              title: item.title,
                              author: item.author,
                              date: item.date,
                            }
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              </details>
            ))}
          </details>
        ))}
      </div>
      <CrawlOnlyLinks items={items} />
    </div>
  );
}
