import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { apiRequest, formatApiError } from "../../lib/api";
import {
  CONTACT_OWNER_EMAIL,
  CONTACT_WHATSAPP_URL,
  humanTokenFor,
  openWhatsAppChat,
} from "../../lib/contact";
import { validateEmail } from "../../lib/validation";
import { createCorrelationId } from "../../lib/telemetry";
import "./HomescoolInterestForm.css";

const HOLD_SECONDS = 5;
const DEFAULT_MESSAGE =
  "I am interested in Homescool and would like more information.";

type Channel = "email" | "whatsapp";

type NotifyResponse = {
  ok?: boolean;
  ownerEmail?: string;
  whatsappUrl?: string;
};

function whatsappHrefWithMessage(name: string, email: string, phone: string, message: string): string {
  const lines = [
    "Hello Eduardo — Homescool",
    name.trim() ? `Name: ${name.trim()}` : "",
    email.trim() ? `Email: ${email.trim()}` : "",
    phone.trim() ? `Phone: ${phone.trim()}` : "",
    "",
    message.trim() || DEFAULT_MESSAGE,
  ].filter((line, i, arr) => !(line === "" && arr[i - 1] === ""));
  return `${CONTACT_WHATSAPP_URL}?text=${encodeURIComponent(lines.join("\n"))}`;
}

/** Lead form: emails eduardooost@gmail.com via /api/contact/notify, or opens WhatsApp. */
export default function HomescoolInterestForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [channel, setChannel] = useState<Channel>("email");
  const [checked, setChecked] = useState(false);
  const [heldMs, setHeldMs] = useState(0);
  const [unlocked, setUnlocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const holdStart = useRef<number | null>(null);

  useEffect(() => {
    if (!checked || unlocked) {
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
        setUnlocked(true);
        window.clearInterval(id);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [checked, unlocked]);

  const progress = Math.min(1, heldMs / (HOLD_SECONDS * 1000));
  const gateLabel = useMemo(() => {
    if (unlocked) return "Verified — you can send";
    if (!checked) return "Confirm you are not a bot";
    const left = Math.max(0, HOLD_SECONDS - Math.floor(heldMs / 1000));
    return `Wait ${left}s… (anti-bot)`;
  }, [unlocked, checked, heldMs]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus(null);
    if (!unlocked || submitting) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setStatus({ kind: "err", text: "Name is required." });
      return;
    }
    const emailError = validateEmail(email);
    if (emailError) {
      setStatus({ kind: "err", text: emailError });
      return;
    }
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      setStatus({ kind: "err", text: "Write a short message." });
      return;
    }

    const waHref = whatsappHrefWithMessage(trimmedName, email, phone, trimmedMessage);

    if (channel === "whatsapp") {
      setSubmitting(true);
      try {
        const correlationId = createCorrelationId();
        await apiRequest<NotifyResponse>("/api/contact/notify", {
          method: "POST",
          correlationId,
          body: {
            visitorName: trimmedName,
            visitorEmail: email.trim(),
            visitorPhone: phone.trim(),
            message: `[Homescool / WhatsApp] ${trimmedMessage}`,
            channel: "whatsapp",
            humanToken: humanTokenFor("homescool", heldMs),
          },
        });
      } catch {
        // Still open WhatsApp even if notify fails — visitor gets through.
      } finally {
        setSubmitting(false);
      }
      openWhatsAppChat(waHref);
      setStatus({
        kind: "ok",
        text: "Opening WhatsApp. I also tried to notify you by email.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const correlationId = createCorrelationId();
      const result = await apiRequest<NotifyResponse>("/api/contact/notify", {
        method: "POST",
        correlationId,
        body: {
          visitorName: trimmedName,
          visitorEmail: email.trim(),
          visitorPhone: phone.trim(),
          message: `[Homescool] ${trimmedMessage}`,
          channel: "email",
          humanToken: humanTokenFor("homescool", heldMs),
        },
      });
      if (result.error) throw new Error(formatApiError(result.error));
      setStatus({
        kind: "ok",
        text: `Done. I will contact you soon at ${CONTACT_OWNER_EMAIL}.`,
      });
      setMessage(DEFAULT_MESSAGE);
    } catch (err) {
      setStatus({
        kind: "err",
        text: err instanceof Error ? err.message : "Could not send. Try WhatsApp.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="homescool-interest" aria-labelledby="homescool-interest-title">
      <h2 id="homescool-interest-title" className="homescool-interest__title">
        I am interested
      </h2>
      <p className="homescool-interest__lead">
        Leave your details and I will send information to my email ({CONTACT_OWNER_EMAIL}), or open
        WhatsApp if you prefer to talk now.
      </p>

      <form className="homescool-interest__form" onSubmit={(e) => void onSubmit(e)} noValidate>
        <div className="homescool-interest__field">
          <label htmlFor="homescool-name">Name</label>
          <input
            id="homescool-name"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="homescool-interest__field">
          <label htmlFor="homescool-email">Email</label>
          <input
            id="homescool-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="homescool-interest__field">
          <label htmlFor="homescool-phone">Phone (optional)</label>
          <input
            id="homescool-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="homescool-interest__field">
          <label htmlFor="homescool-message">Message</label>
          <textarea
            id="homescool-message"
            name="message"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
          />
        </div>
        <div className="homescool-interest__field">
          <label htmlFor="homescool-channel">How you prefer to continue</label>
          <select
            id="homescool-channel"
            name="channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value as Channel)}
          >
            <option value="email">Send to my email ({CONTACT_OWNER_EMAIL})</option>
            <option value="whatsapp">Open WhatsApp</option>
          </select>
        </div>

        <div className="homescool-interest__gate">
          <label className="homescool-interest__check">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => {
                setChecked(e.target.checked);
                if (!e.target.checked) {
                  setUnlocked(false);
                  setHeldMs(0);
                }
              }}
            />
            I am not a bot
          </label>
          <div className="homescool-interest__progress" aria-hidden="true">
            <div
              className="homescool-interest__progress-fill"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <p className="homescool-interest__gate-label">{gateLabel}</p>
        </div>

        <div className="homescool-interest__actions">
          <button className="btn btn--primary" type="submit" disabled={!unlocked || submitting}>
            {submitting ? "Sending…" : channel === "whatsapp" ? "Open WhatsApp" : "Send interest"}
          </button>
        </div>

        {status && (
          <p
            className={`homescool-interest__status homescool-interest__status--${status.kind}`}
            role="status"
          >
            {status.text}
          </p>
        )}
      </form>

      <p className="homescool-interest__alt">
        Shortcuts:{" "}
        <a href={`mailto:${CONTACT_OWNER_EMAIL}?subject=${encodeURIComponent("Homescool — information")}`}>
          {CONTACT_OWNER_EMAIL}
        </a>
        {" · "}
        <a href={CONTACT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
          WhatsApp
        </a>
      </p>
    </section>
  );
}
