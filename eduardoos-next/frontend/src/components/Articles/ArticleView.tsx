import { useEffect, useMemo, useState, type ReactNode } from "react";
import { APP_ROUTES, ARTICLE_ROUTES } from "../../config/routes";
import { fetchArticle, type ArticleBlock } from "../../lib/articles";
import "./ArticleView.css";

/** Apply pamphlet bold range style_indexes[0] = [start, end). */
function StyledArticleText({
  content,
  styleIndexes,
}: {
  content: string;
  styleIndexes?: number[][];
}): ReactNode {
  const range = styleIndexes?.[0];
  if (!range || range.length < 2) return content;
  const start = Number(range[0]);
  const end = Number(range[1]);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    start < 0 ||
    end > content.length
  ) {
    return content;
  }
  return (
    <>
      {start > 0 ? content.slice(0, start) : null}
      <strong>{content.slice(start, end)}</strong>
      {end < content.length ? content.slice(end) : null}
    </>
  );
}

export default function ArticleView() {
  const epamId = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("id")?.trim() || "";
  }, []);

  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState<ArticleBlock[]>([]);
  const [plainText, setPlainText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!epamId) {
      setError("Article id is missing.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const article = await fetchArticle(epamId);
        if (cancelled) return;
        setTitle(article.title || article.meta.title || "Article");
        setBlocks(article.blocks ?? []);
        setPlainText(article.plainText ?? "");
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Error al cargar");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [epamId]);

  useEffect(() => {
    if (!title && !plainText) return;
    const existing = document.getElementById("article-jsonld");
    existing?.remove();
    const script = document.createElement("script");
    script.id = "article-jsonld";
    script.type = "application/ld+json";
    script.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: title,
      inLanguage: "es",
      isAccessibleForFree: true,
      articleBody: plainText,
      url: typeof window !== "undefined" ? window.location.href : undefined,
    });
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, [title, plainText]);

  if (loading) {
    return (
      <div className="article-view">
        <p className="article-view__status">Loading article…</p>
      </div>
    );
  }

  return (
    <div className="article-view">
      <a className="article-view__back" href={APP_ROUTES.articles}>
        ← Articles
      </a>
      {epamId && (
        <p className="article-view__crawl">
          Crawler copies:{" "}
          <a href={ARTICLE_ROUTES.html(epamId)}>semantic HTML</a>
          {" · "}
          <a href={ARTICLE_ROUTES.text(epamId)}>plain text</a>
          {" · "}
          <a href={ARTICLE_ROUTES.item(epamId)}>JSON</a>
        </p>
      )}
      <article className="article-view__sheet" itemScope itemType="https://schema.org/Article">
        <meta itemProp="headline" content={title} />
        {error && <p className="article-view__error">{error}</p>}
        {blocks.map((block, i) => {
          if (block.type === "heading_1") {
            return (
              <h2 key={i} className="article-view__h" itemProp={i === 0 ? "name" : undefined}>
                <StyledArticleText
                  content={block.content}
                  styleIndexes={block.style_indexes}
                />
              </h2>
            );
          }
          if (block.type === "meta") {
            return (
              <p key={i} className="article-view__meta">
                {block.content}
              </p>
            );
          }
          if (block.type === "image") {
            return (
              <figure key={i} className="article-view__figure">
                <img src={block.content} alt="" className="article-view__img" />
              </figure>
            );
          }
          return (
            <p key={i} className="article-view__p" itemProp="articleBody">
              <StyledArticleText
                content={block.content}
                styleIndexes={block.style_indexes}
              />
            </p>
          );
        })}
      </article>
    </div>
  );
}
