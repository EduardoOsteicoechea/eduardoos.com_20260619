import { useEffect, useState } from "react";
import { isAuthenticated } from "../../lib/auth";
import { APP_ROUTES } from "../../config/routes";
import { fetchArticles, type ArticlesListResponse } from "../../lib/articles";
import type { EpamRecord } from "../../lib/epams";
import "./Articles.css";

export default function ArticlesList() {
  const [items, setItems] = useState<EpamRecord[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated()) {
      window.location.href = `${APP_ROUTES.login}?next=${encodeURIComponent(APP_ROUTES.articles)}`;
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res: ArticlesListResponse = await fetchArticles();
        if (!cancelled) setItems(res.articles ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudieron cargar");
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
        <h1 className="articles__title">Artículos</h1>
        <p className="articles__lead">Panfletos en lectura continua, quiz y preguntas al margen.</p>
      </header>
      {loading && <p className="articles__status">Cargando…</p>}
      {error && <p className="articles__error">{error}</p>}
      {!loading && !error && items.length === 0 && (
        <p className="articles__status">No hay panfletos en la nube. Guarda uno desde Panfleto.</p>
      )}
      <ul className="articles__list">
        {items.map((item) => (
          <li key={item.epamId}>
            <a className="articles__card" href={APP_ROUTES.article(item.epamId)}>
              <span className="articles__card-title">{item.title || item.fileName || "Sin título"}</span>
              <span className="articles__card-meta">
                {[item.author, item.series, item.seriesChapter, item.date].filter(Boolean).join(" · ")}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
