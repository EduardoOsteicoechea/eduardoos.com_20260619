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
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudieron cargar");
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
        Artículos
      </h2>
      <p className="homescool-articles__lead">
        Contenido que sale de panfletos guardados en la nube: lectura continua, quiz y preguntas al
        margen.
      </p>

      {needsAuth && (
        <>
          <p className="homescool-articles__status">
            Inicia sesión para ver los artículos publicados desde Panfleto.
          </p>
          <a className="btn btn--primary homescool-articles__cta" href={loginHref}>
            Iniciar sesión
          </a>
        </>
      )}

      {!needsAuth && loading && <p className="homescool-articles__status">Cargando…</p>}
      {!needsAuth && error && <p className="homescool-articles__error">{error}</p>}
      {!needsAuth && !loading && !error && items.length === 0 && (
        <p className="homescool-articles__status">
          Aún no hay panfletos en la nube. Guarda uno desde{" "}
          <a href={APP_ROUTES.pamphlet} data-astro-reload>
            Panfleto
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
                  {item.title || item.fileName || "Sin título"}
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
