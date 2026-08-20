/**
 * Contact / home assistant with anti-bot hold gate.
 * alwaysShowChat docks the tray (used on home desktop).
 * Exposes startChatAfterBotCheck via ref and CONTACT_START_AGENT_EVENT.
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { CONTACT_API_ROUTES } from "../../config/routes";
import { apiRequest, formatApiError } from "../../lib/api";
import {
  DEFAULT_AGENT_WELCOME,
} from "../../lib/agentVoice";
import { createCorrelationId } from "../../lib/correlation";
import ChatMarkdown from "../Chat/ChatMarkdown";
import "./ContactAgent.css";

const HOLD_SECONDS = 5;
const CONTACT_OWNER_EMAIL = "eduardooost@gmail.com";
const CONTACT_WHATSAPP_URL = "https://wa.me/584147281033";

/** Dispatched by ContactChannels so the agent island can start bot check + chat. */
const CONTACT_START_AGENT_EVENT = "eduardoos:contact-start-agent";

const DEFAULT_WELCOME = DEFAULT_AGENT_WELCOME;

type ChatAction = {
  type?: string;
  url?: string;
  href?: string;
  whatsappUrl?: string;
};

type ChatMsg = {
  role: "user" | "assistant";
  text: string;
  actions?: ChatAction[];
};

/** Assistant bubbles render safe Markdown; optional handoff chips below. */
function ChatBubble({ role, text, actions }: ChatMsg) {
  const chips =
    role === "assistant" && actions?.length
      ? actions.flatMap((action, i) => {
          if (action.type === "whatsapp") {
            const url =
              action.whatsappUrl ??
              action.url ??
              action.href ??
              CONTACT_WHATSAPP_URL;
            return [
              <a
                key={`wa-${i}`}
                className="btn btn--primary contact-agent__action-btn"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open WhatsApp
              </a>,
            ];
          }
          if (action.type === "email_notify") {
            return [
              <p key={`em-${i}`} className="contact-agent__action-note">
                Details forwarded to Eduardo by email.
              </p>,
            ];
          }
          return [];
        })
      : [];

  if (role === "assistant") {
    return (
      <div className="contact-agent__msg-block">
        <ChatMarkdown
          className="contact-agent__msg contact-agent__msg--assistant"
          text={text}
        />
        {chips.length > 0 ? (
          <div className="contact-agent__msg-actions" aria-label="Chat actions">
            {chips}
          </div>
        ) : null}
      </div>
    );
  }
  return <div className="contact-agent__msg contact-agent__msg--user">{text}</div>;
}

type AskResponse = {
  answer?: string;
  actions?: ChatAction[];
};

export type ContactAgentHandle = {
  startChatAfterBotCheck: () => void;
};

function humanTokenFor(scopeId: string, heldMs: number): string {
  return `h1:${scopeId}:${Math.floor(heldMs)}`;
}

type ContactAgentProps = {
  scopeId?: string;
  title?: string;
  blurb?: string;
  askPath?: string;
  skillLabel?: string;
  showDirectLinks?: boolean;
  alwaysShowChat?: boolean;
  welcomeMessage?: string;
};

const ContactAgent = forwardRef<ContactAgentHandle, ContactAgentProps>(
  function ContactAgent(
    {
      scopeId = "contact",
      title = "Talk through the agent",
      blurb = "Confirm you are not a bot, then chat with Eduardo’s AI agent (not Eduardo). Leave an email or phone number and the agent will notify him, or ask to continue on WhatsApp.",
      askPath = CONTACT_API_ROUTES.ask,
      skillLabel = "Contact",
      showDirectLinks = false,
      alwaysShowChat = false,
      welcomeMessage = DEFAULT_WELCOME,
    },
    ref,
  ) {
    const [checked, setChecked] = useState(false);
    const [heldMs, setHeldMs] = useState(0);
    const [chatUnlocked, setChatUnlocked] = useState(false);
    const [chat, setChat] = useState<ChatMsg[]>(() =>
      alwaysShowChat ? [{ role: "assistant", text: welcomeMessage }] : [],
    );
    const [draft, setDraft] = useState("");
    const [asking, setAsking] = useState(false);
    const sectionRef = useRef<HTMLElement>(null);
    const threadRef = useRef<HTMLDivElement>(null);
    const checkboxRef = useRef<HTMLInputElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const holdStart = useRef<number | null>(null);
    const pendingFocusAfterUnlock = useRef(false);
    const chatUnlockedRef = useRef(chatUnlocked);
    chatUnlockedRef.current = chatUnlocked;

    function startChatAfterBotCheck() {
      pendingFocusAfterUnlock.current = true;
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      if (!chatUnlockedRef.current) {
        setChecked(true);
        window.requestAnimationFrame(() => {
          checkboxRef.current?.focus({ preventScroll: true });
        });
        return;
      }
      window.requestAnimationFrame(() => {
        inputRef.current?.focus({ preventScroll: true });
        pendingFocusAfterUnlock.current = false;
      });
    }

    useImperativeHandle(ref, () => ({ startChatAfterBotCheck }), []);

    useEffect(() => {
      const onStart = () => startChatAfterBotCheck();
      window.addEventListener(CONTACT_START_AGENT_EVENT, onStart);
      return () => window.removeEventListener(CONTACT_START_AGENT_EVENT, onStart);
    }, []);

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

    useEffect(() => {
      if (!chatUnlocked || !pendingFocusAfterUnlock.current) return;
      pendingFocusAfterUnlock.current = false;
      window.requestAnimationFrame(() => {
        inputRef.current?.focus({ preventScroll: true });
      });
    }, [chatUnlocked]);

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
        const result = await apiRequest<AskResponse>(askPath, {
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
        const actions = result.data?.actions ?? [];
        setChat((prev) => [
          ...prev,
          { role: "assistant", text: answer, actions },
        ]);
      } catch (err) {
        setChat((prev) => [
          ...prev,
          {
            role: "assistant",
            text: err instanceof Error ? err.message : "Error",
          },
        ]);
      } finally {
        setAsking(false);
      }
    }

    // Docked site agent keeps title after unlock; gate-only flows hide chrome
    // once the tray opens. Direct Email/WhatsApp live on /contact channels + in-chat links.
    const showChrome = showGate || alwaysShowChat;

    return (
      <section
        ref={sectionRef}
        className={`contact-agent${showChat ? " contact-agent--tray" : ""}${
          alwaysShowChat ? " contact-agent--docked" : ""
        }`}
        aria-label={chatUnlocked ? "Chat tray" : title}
      >
        {showChrome ? (
          <>
            <header className="contact-agent__head">
              <h2 className="contact-agent__title">{title}</h2>
              {!alwaysShowChat ? <p className="contact-agent__blurb">{blurb}</p> : null}
            </header>

            {showDirectLinks ? (
              <div className="contact-agent__links" aria-label="Direct channels">
                <a className="btn contact-agent__link-btn" href={`mailto:${CONTACT_OWNER_EMAIL}`}>
                  Email
                </a>
                <a
                  className="btn contact-agent__link-btn"
                  href={CONTACT_WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  WhatsApp
                </a>
              </div>
            ) : null}

            {showGate ? (
              <div className="contact-agent__gate" aria-label="Human verification">
                <label className="contact-agent__check">
                  <input
                    ref={checkboxRef}
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setChecked(on);
                      if (!on) {
                        setHeldMs(0);
                        setChatUnlocked(false);
                        pendingFocusAfterUnlock.current = false;
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
            ) : null}
          </>
        ) : null}

        {showChat ? (
          <div className="contact-agent__chat">
            <div ref={threadRef} className="contact-agent__thread">
              {!alwaysShowChat && chat.length === 0 ? (
                <p className="contact-agent__hint">
                  Ask what you need. Leave your email or phone, or request WhatsApp.
                </p>
              ) : null}
              {chat.map((m, i) => (
                <ChatBubble
                  key={`${m.role}-${i}`}
                  role={m.role}
                  text={m.text}
                  actions={m.actions}
                />
              ))}
              {asking ? (
                <p className="contact-agent__hint" aria-live="polite">
                  Thinking…
                </p>
              ) : null}
            </div>
            <form
              className="contact-agent__form"
              onSubmit={(e) => {
                e.preventDefault();
                void sendChat();
              }}
            >
              <textarea
                ref={inputRef}
                className="contact-agent__input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || e.shiftKey) return;
                  e.preventDefault();
                  if (!inputEnabled || !draft.trim()) return;
                  void sendChat();
                }}
                placeholder={chatUnlocked ? "Write your message…" : "Verify above to chat…"}
                disabled={!inputEnabled}
                rows={3}
                autoComplete="off"
                aria-disabled={!chatUnlocked}
                aria-label="Message"
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
        ) : null}
      </section>
    );
  },
);

export default ContactAgent;
export {
  CONTACT_OWNER_EMAIL,
  CONTACT_WHATSAPP_URL,
  CONTACT_START_AGENT_EVENT,
};
