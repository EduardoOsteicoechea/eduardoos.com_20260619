import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiRequest, formatApiError } from "../../lib/api";
import { markdownToSafeHtml } from "../../lib/markdown";
import {
  HOME_SKILLS,
  type HomeSkill,
} from "../../lib/professionalProfile";
import { createCorrelationId } from "../../lib/telemetry";
import "./SkillCards.css";

const HOLD_SECONDS = 5;

type MediaItem = {
  key: string;
  name: string;
  contentType: string;
  url: string;
  kind: "image" | "video" | "other";
};

type ChatMsg = { role: "user" | "assistant"; text: string };

function humanTokenFor(skillId: string, heldMs: number): string {
  // Lightweight client proof: skill + held duration bucket (not a secret; slows bots).
  const bucket = Math.floor(heldMs / 1000);
  return `ok:${skillId}:${bucket}`;
}

function ChatBubble({ role, text }: ChatMsg) {
  if (role === "assistant") {
    return (
      <div
        className="skill-modal__msg skill-modal__msg--assistant skill-modal__md"
        dangerouslySetInnerHTML={{ __html: markdownToSafeHtml(text) }}
      />
    );
  }
  return (
    <div className="skill-modal__msg skill-modal__msg--user">
      {text}
    </div>
  );
}

export default function SkillCards() {
  const [active, setActive] = useState<HomeSkill | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState("");

  const [checked, setChecked] = useState(false);
  const [heldMs, setHeldMs] = useState(0);
  const holdStart = useRef<number | null>(null);
  const [chatUnlocked, setChatUnlocked] = useState(false);

  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [asking, setAsking] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const progress = Math.min(1, heldMs / (HOLD_SECONDS * 1000));
  const current = media[mediaIndex] ?? null;
  const chatStarted = chat.length > 0;

  useEffect(() => {
    if (!checked || chatUnlocked) {
      holdStart.current = null;
      return;
    }
    holdStart.current = performance.now();
    const id = window.setInterval(() => {
      const start = holdStart.current;
      if (start == null) return;
      const elapsed = performance.now() - start;
      setHeldMs(elapsed);
      if (elapsed >= HOLD_SECONDS * 1000) {
        setChatUnlocked(true);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [checked, chatUnlocked]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setMediaLoading(true);
    setMediaError("");
    setMedia([]);
    setMediaIndex(0);
    void (async () => {
      try {
        const correlationId = createCorrelationId();
        const result = await apiRequest<{ items?: MediaItem[] }>(
          `/api/media/skills/${encodeURIComponent(active.id)}`,
          { correlationId },
        );
        if (cancelled) return;
        if (result.error) {
          setMediaError(formatApiError(result.error));
          return;
        }
        setMedia(result.data?.items ?? []);
      } catch (err) {
        if (!cancelled) {
          setMediaError(err instanceof Error ? err.message : "No se pudo cargar media");
        }
      } finally {
        if (!cancelled) setMediaLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => {
    if (!chatStarted) return;
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat, asking, chatStarted]);

  function openSkill(skill: HomeSkill) {
    setActive(skill);
    setChecked(false);
    setHeldMs(0);
    setChatUnlocked(false);
    setChat([]);
    setDraft("");
  }

  function closeModal() {
    setActive(null);
  }

  async function sendChat() {
    if (!active || !chatUnlocked || asking) return;
    const q = draft.trim();
    if (!q) return;
    setAsking(true);
    setDraft("");
    setChat((prev) => [...prev, { role: "user", text: q }]);
    const history = chat.flatMap((m) =>
      m.role === "user" ? [`P: ${m.text}`] : [`R: ${m.text}`],
    );
    try {
      const correlationId = createCorrelationId();
      const result = await apiRequest<{ answer?: string }>("/api/profile/ask", {
        method: "POST",
        correlationId,
        body: {
          question: q,
          skill: active.label,
          history,
          humanToken: humanTokenFor(active.id, heldMs),
        },
      });
      if (result.error) throw new Error(formatApiError(result.error));
      setChat((prev) => [
        ...prev,
        { role: "assistant", text: result.data?.answer || "(sin respuesta)" },
      ]);
    } catch (err) {
      setChat((prev) => [
        ...prev,
        { role: "assistant", text: err instanceof Error ? err.message : "Error" },
      ]);
    } finally {
      setAsking(false);
    }
  }

  const gateLabel = useMemo(() => {
    if (chatUnlocked) return "Verificado — puedes chatear";
    if (!checked) return `Mantén marcado ${HOLD_SECONDS}s para desbloquear el chat`;
    const left = Math.max(0, HOLD_SECONDS - Math.floor(heldMs / 1000));
    return `Espera ${left}s… (anti-bot)`;
  }, [chatUnlocked, checked, heldMs]);

  return (
    <>
      <ul className="skill_cards" aria-label="Skills">
        {HOME_SKILLS.map((skill) => (
          <li key={skill.id}>
            <button
              type="button"
              className="skill_cards__item"
              onClick={() => openSkill(skill)}
            >
              {skill.label}
            </button>
          </li>
        ))}
      </ul>

      {active &&
        createPortal(
        <div
          className="skill-modal"
          role="dialog"
          aria-modal="true"
          aria-label={active.label}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div
            className={`skill-modal__panel${chatStarted ? " skill-modal__panel--chat-only" : ""}`}
          >
            <header className="skill-modal__head">
              <div>
                <h2 className="skill-modal__title">{active.label}</h2>
                <p className="skill-modal__blurb">{active.blurb}</p>
              </div>
              <button
                type="button"
                className="skill-modal__close"
                aria-label="Cerrar"
                onClick={closeModal}
              >
                ×
              </button>
            </header>

            {!chatStarted && (
              <>
                <section className="skill-modal__viewer" aria-label="Portfolio media">
                  {mediaLoading && <p className="skill-modal__status">Cargando media…</p>}
                  {mediaError && <p className="skill-modal__error">{mediaError}</p>}
                  {!mediaLoading && !mediaError && media.length === 0 && (
                    <p className="skill-modal__status">
                      Pronto: imágenes y videos en <code>media/{active.mediaPrefix}/</code> (S3).
                    </p>
                  )}
                  {current && (
                    <div className="skill-modal__frame">
                      {current.kind === "video" ? (
                        <video
                          key={current.url}
                          className="skill-modal__media"
                          src={current.url}
                          controls
                          playsInline
                        />
                      ) : (
                        <img
                          key={current.url}
                          className="skill-modal__media"
                          src={current.url}
                          alt={current.name}
                        />
                      )}
                    </div>
                  )}
                  {media.length > 1 && (
                    <div className="skill-modal__nav">
                      <button
                        type="button"
                        className="skill-modal__nav-btn"
                        onClick={() =>
                          setMediaIndex((i) => (i === 0 ? media.length - 1 : i - 1))
                        }
                      >
                        ←
                      </button>
                      <span className="skill-modal__nav-meta">
                        {mediaIndex + 1} / {media.length}
                      </span>
                      <button
                        type="button"
                        className="skill-modal__nav-btn"
                        onClick={() => setMediaIndex((i) => (i + 1) % media.length)}
                      >
                        →
                      </button>
                    </div>
                  )}
                </section>

                <section className="skill-modal__gate" aria-label="Verificación humana">
                  <label className="skill-modal__check">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={chatUnlocked}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setChecked(on);
                        if (!on) {
                          setHeldMs(0);
                          setChatUnlocked(false);
                        }
                      }}
                    />
                    <span>{gateLabel}</span>
                  </label>
                  <div
                    className="skill-modal__progress"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progress * 100)}
                  >
                    <div
                      className="skill-modal__progress-fill"
                      style={{ width: `${progress * 100}%` }}
                    />
                  </div>
                </section>
              </>
            )}

            {chatUnlocked && (
              <section
                className={`skill-modal__chat${chatStarted ? " skill-modal__chat--active" : ""}`}
                aria-label="Chat profesional"
              >
                <div ref={threadRef} className="skill-modal__thread">
                  {!chatStarted && (
                    <p className="skill-modal__hint">
                      Pregunta sobre esta skill o el perfil profesional de Eduardo.
                    </p>
                  )}
                  {chat.map((m, i) => (
                    <ChatBubble key={i} role={m.role} text={m.text} />
                  ))}
                  {asking && (
                    <p className="skill-modal__hint" aria-live="polite">
                      Pensando…
                    </p>
                  )}
                </div>
                <form
                  className="skill-modal__form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void sendChat();
                  }}
                >
                  <input
                    className="skill-modal__input"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Escribe tu pregunta…"
                    disabled={asking}
                    autoComplete="off"
                  />
                  <button
                    type="submit"
                    className="btn btn--primary skill-modal__send"
                    disabled={asking || !draft.trim()}
                  >
                    {asking ? "…" : "Enviar"}
                  </button>
                </form>
              </section>
            )}
          </div>
        </div>,
        document.body,
        )}
    </>
  );
}
