import { useEffect, useMemo, useState } from "react";
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
      setError("Falta el id del artículo.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const article = await fetchArticle(epamId);
        if (cancelled) return;
        setTitle(article.title || article.meta.title || "Artículo");
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
        <p className="article-view__status">Cargando artículo…</p>
      </div>
    );
  }

  return (
    <div className="article-view">
      <a className="article-view__back" href={APP_ROUTES.articles}>
        ← Artículos
      </a>
      <article className="article-view__sheet">
        {error && <p className="article-view__error">{error}</p>}
        {blocks.map((block, i) => {
          if (block.type === "heading_1") {
            return (
              <h2 key={i} className="article-view__h">
                {block.content}
              </h2>
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
              {block.content}
            </p>
          );
        })}

        <section className="article-quiz" aria-label="Quiz del artículo">
          <h2 className="article-quiz__title">Quiz</h2>
          {quizLoading && <p className="article-view__status">Generando preguntas con IA…</p>}
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
        aria-label="Preguntar sobre el artículo"
        onClick={() => setSidebarOpen(true)}
      >
        ?
      </button>

      {sidebarOpen && (
        <div className="article-ask" role="dialog" aria-modal="true" aria-label="Preguntas sobre el artículo">
          <div className="article-ask__panel">
            <header className="article-ask__head">
              <h2 className="article-ask__title">Preguntar</h2>
              <p className="article-ask__context">Contexto: {title}</p>
              <button type="button" className="article-ask__close" onClick={() => setSidebarOpen(false)}>
                Cerrar
              </button>
            </header>
            <div className="article-ask__thread">
              {chat.length === 0 && (
                <p className="article-ask__hint">Pregunta lo que quieras sobre este artículo.</p>
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
                placeholder="Escribe tu pregunta…"
                disabled={asking}
              />
              <button type="submit" className="btn btn--primary" disabled={asking || !draft.trim()}>
                {asking ? "Pensando…" : "Enviar"}
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
              {modal.passed ? "Aprobado" : "Hay que repasar"}
            </h2>
            <p className="article-quiz-modal__score">
              {modal.score} / {modal.total} correctas
            </p>
            {!modal.passed && (
              <ul className="article-quiz-modal__misses">
                {modal.misses.map((q) => (
                  <li key={q.id}>
                    <strong>{q.prompt}</strong>
                    <span>{q.explanation || `Respuesta: ${q.choices[q.answerIndex]}`}</span>
                  </li>
                ))}
              </ul>
            )}
            {modal.passed && (
              <p className="article-quiz-modal__ok">Dominaste el contenido de este artículo.</p>
            )}
            <button type="button" className="btn btn--primary" onClick={restoreQuiz}>
              Restaurar quiz
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
