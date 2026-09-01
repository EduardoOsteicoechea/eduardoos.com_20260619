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

/** Home dock welcome — work / skills focus. */
export const HOME_AGENT_WELCOME =
  "Hello — I am Eduardo’s AI agent (not Eduardo). Confirm you are not a bot above, then ask about his work, skills, or how to get in touch.";

/** Contact dock welcome — reach / handoff focus (only chrome difference vs home). */
export const CONTACT_AGENT_WELCOME =
  "Hello — I am Eduardo’s AI agent (not Eduardo). Confirm you are not a bot above, then ask how to reach Eduardo, leave your email or phone, or request WhatsApp — I can notify him and share links in this chat.";

export type SiteAgentSurface = "home" | "contact";

/**
 * Shared dock preset for `/` and `/contact`.
 * Identical chrome; welcome + scope/skill differ by surface.
 */
export function siteAgentDockProps(surface: SiteAgentSurface) {
  return {
    alwaysShowChat: true as const,
    showDirectLinks: false as const,
    title: "Talk To Assistant",
    askPath: CONTACT_API_ROUTES.profileAsk,
    welcomeMessage:
      surface === "home" ? HOME_AGENT_WELCOME : CONTACT_AGENT_WELCOME,
    scopeId: surface,
    skillLabel: surface === "home" ? "Home" : "Contact",
  };
}
