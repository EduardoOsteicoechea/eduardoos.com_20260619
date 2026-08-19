/**
 * Contact page channel actions: Email, WhatsApp, and Through AI agent.
 * The AI button dispatches CONTACT_START_AGENT_EVENT so ContactAgent (sibling island)
 * can run bot verification and focus the chat.
 */

import {
  CONTACT_OWNER_EMAIL,
  CONTACT_START_AGENT_EVENT,
  CONTACT_WHATSAPP_URL,
} from "./ContactAgent";
import "./ContactChannels.css";

type ContactChannelsProps = {
  email?: string;
  whatsappUrl?: string;
};

export default function ContactChannels({
  email = CONTACT_OWNER_EMAIL,
  whatsappUrl = CONTACT_WHATSAPP_URL,
}: ContactChannelsProps) {
  function startThroughAgent() {
    window.dispatchEvent(new CustomEvent(CONTACT_START_AGENT_EVENT));
  }

  return (
    <ul className="contact-page__channels" aria-label="Contact channels">
      <li>
        <span className="contact-page__label">Email</span>
        <a className="btn contact-page__channel-btn" href={`mailto:${email}`}>
          Email
        </a>
      </li>
      <li>
        <span className="contact-page__label">WhatsApp</span>
        <a
          className="btn contact-page__channel-btn"
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          WhatsApp
        </a>
      </li>
      <li>
        <span className="contact-page__label">AI agent</span>
        <button
          type="button"
          className="btn btn--primary contact-page__channel-btn"
          onClick={startThroughAgent}
        >
          Through AI agent
        </button>
      </li>
    </ul>
  );
}
