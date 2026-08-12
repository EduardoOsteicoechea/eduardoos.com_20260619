import { useEffect, useState } from "react";
import { APP_ROUTES } from "../../config/routes";
import {
  getAuthEmailFromToken,
  getAuthToken,
  isApsAdminEmail,
  isAuthenticated,
} from "../../lib/auth";
import { apiRequest, formatApiError } from "../../lib/api";
import { createCorrelationId } from "../../lib/telemetry";
import {
  EDEBAT_ROUTES,
  type EdebatDocument,
  type EdebatRecord,
} from "../../lib/edebat";
import "./EdebatApp.css";

function emptyLocalDoc(): EdebatDocument {
  return {
    version: 1,
    id: "",
    title: "Nuevo debate",
    topic: "",
    roundsTotal: 3,
    rules: [],
    participants: [],
    rounds: [],
    result: null,
    createdAt: "",
    updatedAt: "",
  };
}

function winnerLabel(winner: string | undefined): string {
  if (winner === "challenger") return "Tú";
  if (winner === "opponent") return "Experto";
  if (winner === "draw") return "Empate";
  return winner ?? "—";
}

export default function EdebatApp() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [list, setList] = useState<EdebatRecord[]>([]);
  const [doc, setDoc] = useState<EdebatDocument>(emptyLocalDoc());
  const [draftArg, setDraftArg] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [showWinner, setShowWinner] = useState(false);
  const [ruleDraft, setRuleDraft] = useState("");

  useEffect(() => {
    if (!isAuthenticated()) {
      window.location.replace(
        `${APP_ROUTES.login}?next=${encodeURIComponent(APP_ROUTES.edebat)}`,
      );
      return;
    }
    const ok = isApsAdminEmail(getAuthEmailFromToken());
    setAuthorized(ok);
    if (ok) {
      void refreshList();
    }
  }, []);

  async function refreshList() {
    const authToken = getAuthToken();
    const res = await apiRequest<{ edebats?: EdebatRecord[] }>(EDEBAT_ROUTES.list, {
      method: "GET",
      correlationId: createCorrelationId(),
      authToken,
    });
    if (res.error) {
      setError(formatApiError(res.error));
      return;
    }
    setList(res.data?.edebats ?? []);
  }

  async function createDebate() {
    setBusy(true);
    setError("");
    setStatus("Creando debate…");
    const res = await apiRequest<{ document?: EdebatDocument }>(EDEBAT_ROUTES.create, {
      method: "POST",
      correlationId: createCorrelationId(),
      authToken: getAuthToken(),
    });
    setBusy(false);
    if (res.error || !res.data?.document) {
      setError(res.error ? formatApiError(res.error) : "No se pudo crear");
      setStatus("");
      return;
    }
    setDoc(res.data.document);
    setDraftArg("");
    setShowWinner(false);
    setSidebarOpen(false);
    setStatus("Debate nuevo listo");
    await refreshList();
  }

  async function openDebate(id: string) {
    setBusy(true);
    setError("");
    setStatus("Cargando…");
    const res = await apiRequest<{ document?: EdebatDocument }>(EDEBAT_ROUTES.item(id), {
      method: "GET",
      correlationId: createCorrelationId(),
      authToken: getAuthToken(),
    });
    setBusy(false);
    if (res.error || !res.data?.document) {
      setError(res.error ? formatApiError(res.error) : "No se pudo abrir");
      setStatus("");
      return;
    }
    setDoc(res.data.document);
    setDraftArg("");
    setShowWinner(Boolean(res.data.document.result));
    setSidebarOpen(false);
    setStatus("Debate cargado");
  }

  async function saveDebate(next: EdebatDocument = doc) {
    if (!next.id) {
      setError("Crea o abre un debate primero");
      return;
    }
    setBusy(true);
    setError("");
    setStatus("Guardando…");
    const res = await apiRequest<{ document?: EdebatDocument }>(EDEBAT_ROUTES.item(next.id), {
      method: "PUT",
      body: { document: next },
      correlationId: createCorrelationId(),
      authToken: getAuthToken(),
    });
    setBusy(false);
    if (res.error || !res.data?.document) {
      setError(res.error ? formatApiError(res.error) : "No se pudo guardar");
      setStatus("");
      return;
    }
    setDoc(res.data.document);
    setStatus("Guardado");
    await refreshList();
  }

  async function submitTurn() {
    if (!doc.id) {
      setError("Crea o abre un debate primero");
      return;
    }
    const argument = draftArg.trim();
    if (!argument) {
      setError("Escribe tu argumento");
      return;
    }
    if (!doc.topic.trim()) {
      setError("Define el tema antes de debatir");
      return;
    }
    setBusy(true);
    setError("");
    setStatus("Esperando experto y árbitro…");
    // Persist setup fields before the turn so topic/rules/rounds are current.
    const saved = await apiRequest<{ document?: EdebatDocument }>(EDEBAT_ROUTES.item(doc.id), {
      method: "PUT",
      body: { document: doc },
      correlationId: createCorrelationId(),
      authToken: getAuthToken(),
    });
    if (saved.error || !saved.data?.document) {
      setBusy(false);
      setError(saved.error ? formatApiError(saved.error) : "No se pudo guardar antes del turno");
      setStatus("");
      return;
    }
    const turn = await apiRequest<{ document?: EdebatDocument }>(EDEBAT_ROUTES.turn(doc.id), {
      method: "POST",
      body: { argument },
      correlationId: createCorrelationId(),
      authToken: getAuthToken(),
    });
    setBusy(false);
    if (turn.error || !turn.data?.document) {
      setError(turn.error ? formatApiError(turn.error) : "Turno falló");
      setStatus("");
      return;
    }
    setDoc(turn.data.document);
    setDraftArg("");
    setStatus("Ronda completada");
    if (turn.data.document.result) {
      setShowWinner(true);
    }
    await refreshList();
  }

  function addRule() {
    const text = ruleDraft.trim();
    if (!text) return;
    setDoc((prev) => ({ ...prev, rules: [...prev.rules, text] }));
    setRuleDraft("");
  }

  function removeRule(index: number) {
    setDoc((prev) => ({
      ...prev,
      rules: prev.rules.filter((_, i) => i !== index),
    }));
  }

  if (authorized === null) {
    return <p className="edebat__status">Comprobando acceso…</p>;
  }
  if (!authorized) {
    return (
      <section className="edebat edebat--denied">
        <h1 className="edebat__title">Edebat</h1>
        <p className="edebat__lead">No tienes permiso para esta app.</p>
      </section>
    );
  }

  const finished = Boolean(doc.result) || doc.rounds.length >= doc.roundsTotal;

  return (
    <section className="edebat">
      <header className="edebat__top">
        <button
          type="button"
          className="btn"
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen((v) => !v)}
        >
          Menú
        </button>
        <h1 className="edebat__title">Edebat</h1>
        <button type="button" className="btn btn--primary" disabled={busy || !doc.id} onClick={() => void saveDebate()}>
          Guardar
        </button>
      </header>

      {sidebarOpen ? (
        <aside className="edebat__sidebar" aria-label="Lista de debates">
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void createDebate()}>
            Nuevo
          </button>
          <ul className="edebat__list">
            {list.map((item) => (
              <li key={item.debateId}>
                <button
                  type="button"
                  className={`edebat__list-item${doc.id === item.debateId ? " is-active" : ""}`}
                  disabled={busy}
                  onClick={() => void openDebate(item.debateId)}
                >
                  <span>{item.title || item.debateId}</span>
                  <small>
                    {item.roundsCompleted}/{item.roundsTotal}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}

      <div className="edebat__setup">
        <label className="edebat__field edebat__field--topic">
          <span>Tema</span>
          <textarea
            value={doc.topic}
            disabled={busy || finished}
            rows={3}
            onChange={(e) => setDoc((prev) => ({ ...prev, topic: e.target.value }))}
          />
        </label>
        <label className="edebat__field edebat__field--rounds">
          <span>Rondas</span>
          <input
            type="number"
            min={1}
            max={20}
            value={doc.roundsTotal}
            disabled={busy || finished || doc.rounds.length > 0}
            onChange={(e) =>
              setDoc((prev) => ({
                ...prev,
                roundsTotal: Math.max(1, Math.min(20, Number(e.target.value) || 1)),
              }))
            }
          />
        </label>
      </div>

      <div className="edebat__rules">
        <div className="edebat__rules-add">
          <input
            type="text"
            placeholder="Nueva regla"
            value={ruleDraft}
            disabled={busy || finished}
            onChange={(e) => setRuleDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addRule();
              }
            }}
          />
          <button type="button" className="btn" disabled={busy || finished} onClick={addRule}>
            +
          </button>
        </div>
        <ul className="edebat__rules-list">
          {doc.rules.map((rule, index) => (
            <li key={`${index}-${rule}`}>
              <span>{rule}</span>
              <button
                type="button"
                className="btn"
                disabled={busy || finished}
                aria-label="Quitar regla"
                onClick={() => removeRule(index)}
              >
                −
              </button>
            </li>
          ))}
        </ul>
      </div>

      {doc.result ? (
        <div className="edebat__result">
          <strong>Ganador: {winnerLabel(doc.result.winner)}</strong>
          <p>{doc.result.summary}</p>
          <p>
            Marcador final: {doc.result.finalScores.challenger} – {doc.result.finalScores.opponent}
          </p>
        </div>
      ) : null}

      <div className="edebat__debate">
        <div className="edebat__input-tray">
          <label className="edebat__field">
            <span>Tu argumento</span>
            <textarea
              value={draftArg}
              rows={6}
              disabled={busy || finished || !doc.id}
              onChange={(e) => setDraftArg(e.target.value)}
              placeholder={doc.id ? "Escribe tu argumento de esta ronda…" : "Crea o abre un debate"}
            />
          </label>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || finished || !doc.id}
            onClick={() => void submitTurn()}
          >
            Enviar ronda
          </button>
        </div>

        <div className="edebat__transcript" aria-live="polite">
          {doc.rounds.length === 0 ? (
            <p className="edebat__empty">Aún no hay rondas.</p>
          ) : (
            doc.rounds.map((round) => (
              <article key={round.index} className="edebat__round">
                <header>Ronda {round.index}</header>
                <div className="edebat__round-cols">
                  <div>
                    <h3>Tú</h3>
                    <p>{round.challengerArg}</p>
                  </div>
                  <div>
                    <h3>Experto</h3>
                    <p>{round.opponentArg}</p>
                  </div>
                </div>
                {round.referee ? (
                  <footer className="edebat__referee">
                    <strong>
                      Árbitro · {round.referee.challengerScore} – {round.referee.opponentScore}
                    </strong>
                    <p>{round.referee.analysis}</p>
                  </footer>
                ) : null}
              </article>
            ))
          )}
        </div>
      </div>

      {status ? <p className="edebat__status">{status}</p> : null}
      {error ? <p className="edebat__error">{error}</p> : null}

      {showWinner && doc.result ? (
        <div className="edebat__modal" role="dialog" aria-modal="true" aria-labelledby="edebat-winner-title">
          <div className="edebat__modal-card">
            <h2 id="edebat-winner-title">Resultado</h2>
            <p className="edebat__modal-winner">{winnerLabel(doc.result.winner)}</p>
            <p>{doc.result.summary}</p>
            <p>
              {doc.result.finalScores.challenger} – {doc.result.finalScores.opponent}
            </p>
            <button type="button" className="btn btn--primary" onClick={() => setShowWinner(false)}>
              Cerrar
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
