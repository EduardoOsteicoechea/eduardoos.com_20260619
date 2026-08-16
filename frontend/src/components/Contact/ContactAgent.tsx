import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest, formatApiError } from "../../lib/api";
import {
  applyContactActions,
  CONTACT_OWNER_EMAIL,
  CONTACT_WHATSAPP_URL,
  humanTokenFor,
  type ProfileAskResponse,
} from "../../lib/contact";
import { markdownToSafeHtml } from "../../lib/markdown";
import { createCorrelationId } from "../../lib/telemetry";
import "./ContactAgent.css";

const HOLD_SECONDS = 5;

const DEFAULT_WELCOME =
  "Hello — I am Eduardo’s AI agent (not Eduardo). Confirm you are not a bot below, then ask about architecture, BIM, software, or how to reach him.";

type ChatMsg = { role: "user" | "assistant"; text: string };

function ChatBubble({ role, text }: ChatMsg) {
  if (role === "assistant") {
    return (
      <div
        className="contact-agent__msg contact-agent__msg--assistant contact-agent__md"
        dangerouslySetInnerHTML={{ __html: markdownToSafeHtml(text) }}
      />
    );
  }
  return <div className="contact-agent__msg contact-agent__msg--user">{text}</div>;
}

type ContactAgentProps = {
  /** Scope id baked into the anti-bot humanToken (e.g. contact, skill id). */
  scopeId?: string;
  title?: string;
  blurb?: string;
  askPath?: "/api/contact/ask" | "/api/profile/ask";
  skillLabel?: string;
  /** Direct mailto / WhatsApp links above the gate. Off on /contact (copy lives left). */
  showDirectLinks?: boolean;
  /**
   * Always show the chat tray (welcome + thread + input). The gate stays visible
   * until verified; the textarea stays disabled until then.
   */
  alwaysShowChat?: boolean;
  /** First assistant bubble when alwaysShowChat is on. */
  welcomeMessage?: string;
};

export default function ContactAgent({
  scopeId = "contact",
  title = "Talk through the agent",
  blurb = "Confirm you are not a bot, then chat with Eduardo’s AI agent (not Eduardo). Leave an email or phone number and the agent will notify him, or ask to continue on WhatsApp.",
  askPath = "/api/contact/ask",
  skillLabel = "Contact",
  showDirectLinks = true,
  alwaysShowChat = false,
  welcomeMessage = DEFAULT_WELCOME,
}: ContactAgentProps) {
  const [checked, setChecked] = useState(false);
  const [heldMs, setHeldMs] = useState(0);
  const [chatUnlocked, setChatUnlocked] = useState(false);
  const [chat, setChat] = useState<ChatMsg[]>(() =>
    alwaysShowChat ? [{ role: "assistant", text: welcomeMessage }] : [],
  );
  const [draft, setDraft] = useState("");
  const [asking, setAsking] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const holdStart = useRef<number | null>(null);

  useEffect(() => {
    if (!checked || chatUnlocked) {
      holdStart.current = null;
      return;
    }
    holdStart.current = Date.now();
    const id = window.setInterval(() => {
      const start = holdStart.current;
      if (!start) return;
      const ms = Date.now() - start;
      setHeldMs(ms);
      if (ms >= HOLD_SECONDS * 1000) {
        setChatUnlocked(true);
        window.clearInterval(id);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [checked, chatUnlocked]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [chat, asking]);

  const progress = Math.min(1, heldMs / (HOLD_SECONDS * 1000));
  const gateLabel = useMemo(() => {
    if (chatUnlocked) return "Verified — you can chat";
    if (!checked) return "Confirm you are not a bot";
    const left = Math.max(0, HOLD_SECONDS - Math.floor(heldMs / 1000));
    return `Wait ${left}s… (anti-bot)`;
  }, [chatUnlocked, checked, heldMs]);

  const showGate = !chatUnlocked;
  const showChat = alwaysShowChat || chatUnlocked;
  const inputEnabled = chatUnlocked && !asking;

  async function sendChat() {
    if (!chatUnlocked || asking) return;
    const q = draft.trim();
    if (!q) return;
    setAsking(true);
    setDraft("");
    setChat((prev) => [...prev, { role: "user", text: q }]);
    const history = chat.flatMap((m) =>
      m.role === "user" ? [`Q: ${m.text}`] : [`A: ${m.text}`],
    );
    try {
      const correlationId = createCorrelationId();
      const result = await apiRequest<ProfileAskResponse>(askPath, {
        method: "POST",
        correlationId,
        body: {
          question: q,
          skill: skillLabel,
          history,
          humanToken: humanTokenFor(scopeId, heldMs),
        },
      });
      if (result.error) throw new Error(formatApiError(result.error));
      const answer = result.data?.answer || "(no reply)";
      applyContactActions(result.data?.actions);
      setChat((prev) => [...prev, { role: "assistant", text: answer }]);
    } catch (err) {
      setChat((prev) => [
        ...prev,
        { role: "assistant", text: err instanceof Error ? err.message : "Error" },
      ]);
    } finally {
      setAsking(false);
    }
  }

  return (
    <section
      className={`contact-agent${showChat ? " contact-agent--tray" : ""}${
        alwaysShowChat ? " contact-agent--docked" : ""
      }`}
      aria-label={chatUnlocked ? "Chat tray" : title}
    >
      {showGate && (
        <>
          {!alwaysShowChat && (
            <header className="contact-agent__head">
              <h2 className="contact-agent__title">{title}</h2>
              <p className="contact-agent__blurb">{blurb}</p>
            </header>
          )}

          {alwaysShowChat && (
            <header className="contact-agent__head">
              <h2 className="contact-agent__title">{title}</h2>
            </header>
          )}

          {showDirectLinks && (
            <div className="contact-agent__links" aria-label="Direct channels">
              <a className="contact-agent__link" href={`mailto:${CONTACT_OWNER_EMAIL}`}>
                {CONTACT_OWNER_EMAIL}
              </a>
              <a
                className="contact-agent__link"
                href={CONTACT_WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp
              </a>
            </div>
          )}

          <div className="contact-agent__gate" aria-label="Human verification">
            <label className="contact-agent__check">
              <input
                type="checkbox"
                checked={checked}
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
              className="contact-agent__progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
            >
              <div
                className="contact-agent__progress-fill"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
        </>
      )}

      {showChat && (
        <div className="contact-agent__chat">
          <div ref={threadRef} className="contact-agent__thread">
            {!alwaysShowChat && chat.length === 0 && (
              <p className="contact-agent__hint">
                Ask what you need. To reach me, leave your email or phone number,
                or request WhatsApp and I will open the chat.
              </p>
            )}
            {chat.map((m, i) => (
              <ChatBubble key={i} role={m.role} text={m.text} />
            ))}
            {asking && (
              <p className="contact-agent__hint" aria-live="polite">
                Thinking…
              </p>
            )}
          </div>
          <form
            className="contact-agent__form"
            onSubmit={(e) => {
              e.preventDefault();
              void sendChat();
            }}
          >
            <input
              className="contact-agent__input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                chatUnlocked ? "Write your message…" : "Verify above to chat…"
              }
              disabled={!inputEnabled}
              autoComplete="off"
              aria-disabled={!chatUnlocked}
            />
            <button
              type="submit"
              className="btn btn--primary contact-agent__send"
              disabled={!inputEnabled || !draft.trim()}
            >
              {asking ? "…" : "Send"}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
