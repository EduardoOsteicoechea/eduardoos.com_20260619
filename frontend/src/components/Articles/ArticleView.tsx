import { useEffect, useMemo, useState, type ReactNode } from "react";
import { isAuthenticated } from "../../lib/auth";
import { APP_ROUTES } from "../../config/routes";
import {
  askArticle,
  fetchArticle,
  fetchArticleQuiz,
  type ArticleBlock,
  type QuizDocument,
  type QuizQuestion,
} from "../../lib/articles";
import "./ArticleView.css";

type ChatMsg = { role: "user" | "assistant"; text: string };

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
  const [quiz, setQuiz] = useState<QuizDocument | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [modal, setModal] = useState<null | { passed: boolean; score: number; total: number; misses: QuizQuestion[] }>(
    null,
  );

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      const next = epamId
        ? APP_ROUTES.article(epamId)
        : APP_ROUTES.articles;
      window.location.href = `${APP_ROUTES.login}?next=${encodeURIComponent(next)}`;
      return;
    }
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
        setQuizLoading(true);
        try {
          const q = await fetchArticleQuiz(epamId);
          if (!cancelled) setQuiz(q.quiz);
        } catch (quizErr) {
          if (!cancelled) {
            setError(quizErr instanceof Error ? quizErr.message : "No se pudo generar el quiz");
          }
        } finally {
          if (!cancelled) setQuizLoading(false);
        }
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

  const allAnswered = useMemo(() => {
    if (!quiz?.questions?.length) return false;
    return quiz.questions.every((q) => answers[q.id] !== undefined);
  }, [quiz, answers]);

  useEffect(() => {
    if (!allAnswered || !quiz || modal) return;
    const misses = quiz.questions.filter((q) => answers[q.id] !== q.answerIndex);
    const score = quiz.questions.length - misses.length;
    setModal({
      passed: misses.length === 0,
      score,
      total: quiz.questions.length,
      misses,
    });
  }, [allAnswered, quiz, answers, modal]);

  function restoreQuiz() {
    setAnswers({});
    setModal(null);
  }

  async function sendQuestion() {
    const q = draft.trim();
    if (!q || asking) return;
    setAsking(true);
    setDraft("");
    setChat((prev) => [...prev, { role: "user", text: q }]);
    const history = chat.flatMap((m) =>
      m.role === "user" ? [`P: ${m.text}`] : [`R: ${m.text}`],
    );
    try {
      const res = await askArticle(epamId, q, history);
      setChat((prev) => [...prev, { role: "assistant", text: res.answer || "(sin respuesta)" }]);
    } catch (err) {
      setChat((prev) => [
        ...prev,
        { role: "assistant", text: err instanceof Error ? err.message : "Error" },
      ]);
    } finally {
      setAsking(false);
    }
  }

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
      <article className="article-view__sheet">
        {error && <p className="article-view__error">{error}</p>}
        {blocks.map((block, i) => {
          if (block.type === "heading_1") {
            return (
              <h2 key={i} className="article-view__h">
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
            <p key={i} className="article-view__p">
              <StyledArticleText
                content={block.content}
                styleIndexes={block.style_indexes}
              />
            </p>
          );
        })}

        <section className="article-quiz" aria-label="Article quiz">
          <h2 className="article-quiz__title">Quiz</h2>
          {quizLoading && <p className="article-view__status">Generating questions with AI…</p>}
          {!quizLoading && quiz?.questions?.map((q) => (
            <fieldset key={q.id} className="article-quiz__q">
              <legend className="article-quiz__prompt">{q.prompt}</legend>
              <div className="article-quiz__choices">
                {q.choices.map((choice, idx) => {
                  const selected = answers[q.id] === idx;
                  return (
                    <label key={idx} className={`article-quiz__choice${selected ? " is-selected" : ""}`}>
                      <input
                        type="radio"
                        name={q.id}
                        checked={selected}
                        onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: idx }))}
                      />
                      <span>{choice}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </section>
      </article>

      <button
        type="button"
        className="article-view__fab"
        aria-label="Ask about this article"
        onClick={() => setSidebarOpen(true)}
      >
        ?
      </button>

      {sidebarOpen && (
        <div className="article-ask" role="dialog" aria-modal="true" aria-label="Questions about this article">
          <div className="article-ask__panel">
            <header className="article-ask__head">
              <h2 className="article-ask__title">Ask</h2>
              <p className="article-ask__context">Context: {title}</p>
              <button type="button" className="article-ask__close" onClick={() => setSidebarOpen(false)}>
                Close
              </button>
            </header>
            <div className="article-ask__thread">
              {chat.length === 0 && (
                <p className="article-ask__hint">Ask anything you want about this article.</p>
              )}
              {chat.map((m, i) => (
                <div key={i} className={`article-ask__msg article-ask__msg--${m.role}`}>
                  {m.text}
                </div>
              ))}
            </div>
            <form
              className="article-ask__form"
              onSubmit={(e) => {
                e.preventDefault();
                void sendQuestion();
              }}
            >
              <textarea
                className="article-ask__input"
                rows={3}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write your question…"
                disabled={asking}
              />
              <button type="submit" className="btn btn--primary" disabled={asking || !draft.trim()}>
                {asking ? "Thinking…" : "Send"}
              </button>
            </form>
          </div>
        </div>
      )}

      {modal && (
        <div className="article-quiz-modal" role="dialog" aria-modal="true">
          <div className="article-quiz-modal__card">
            <div
              className={`article-quiz-modal__gesture${modal.passed ? " is-pass" : " is-fail"}`}
              aria-hidden
            >
              {modal.passed ? "✓" : "✕"}
            </div>
            <h2 className="article-quiz-modal__title">
              {modal.passed ? "Passed" : "Needs review"}
            </h2>
            <p className="article-quiz-modal__score">
              {modal.score} / {modal.total} correct
            </p>
            {!modal.passed && (
              <ul className="article-quiz-modal__misses">
                {modal.misses.map((q) => (
                  <li key={q.id}>
                    <strong>{q.prompt}</strong>
                    <span>{q.explanation || `Answer: ${q.choices[q.answerIndex]}`}</span>
                  </li>
                ))}
              </ul>
            )}
            {modal.passed && (
              <p className="article-quiz-modal__ok">You mastered this article.</p>
            )}
            <button type="button" className="btn btn--primary" onClick={restoreQuiz}>
              Restore quiz
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
