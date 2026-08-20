/**
 * Shared visitor-agent identity and welcome copy.
 * Keep aligned with backend/internal/contact/identity.go, PROFILE_CONTEXT.md,
 * and .cursor/skills/agent-voice.
 */

import { CONTACT_API_ROUTES } from "../config/routes";

/** Short chrome label — never implies the speaker is Eduardo. */
export const AGENT_ROLE_LABEL = "Eduardo’s AI agent";

/** Default welcome for non-docked contact flows. */
export const DEFAULT_AGENT_WELCOME =
  "Hello — I am Eduardo’s AI agent (not Eduardo). Confirm you are not a bot above, then ask about his architecture and software work, skills, or how to reach him.";

/**
 * Canonical dock welcome (home + contact). Mentions Email/WhatsApp buttons
 * and chat handoff without impersonating Eduardo.
 */
export const HOME_AGENT_WELCOME =
  "Hello — I am Eduardo’s AI agent (not Eduardo). Confirm you are not a bot above, then ask about his work, skills, or how to get in touch. Use Email or WhatsApp above, or leave your details in chat and I will notify him.";

/** Alias — same string; site dock is one product. */
export const SITE_AGENT_WELCOME = HOME_AGENT_WELCOME;

export type SiteAgentSurface = "home" | "contact";

/**
 * Shared dock preset for `/` and `/contact`.
 * Only scopeId / skillLabel differ for gate tokens and telemetry.
 */
export function siteAgentDockProps(surface: SiteAgentSurface) {
  return {
    alwaysShowChat: true as const,
    showDirectLinks: true as const,
    title: "AI agent",
    askPath: CONTACT_API_ROUTES.profileAsk,
    welcomeMessage: SITE_AGENT_WELCOME,
    scopeId: surface,
    skillLabel: surface === "home" ? "Home" : "Contact",
  };
}
