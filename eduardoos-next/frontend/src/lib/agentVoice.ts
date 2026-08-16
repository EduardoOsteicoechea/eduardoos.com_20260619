/**
 * Shared visitor-agent identity and welcome copy.
 * Keep aligned with pkg/contact/agent_identity.go and .cursor/skills/agent-voice.
 */

/** Short chrome label — never implies the speaker is Eduardo. */
export const AGENT_ROLE_LABEL = "Eduardo’s AI agent";

/** Default welcome for contact / docked chat. */
export const DEFAULT_AGENT_WELCOME =
  "Hello — I am Eduardo’s AI agent (not Eduardo). Confirm you are not a bot below, then ask about architecture, BIM, software, or how to reach him.";

/** Home dock welcome (skills / work focus). */
export const HOME_AGENT_WELCOME =
  "Hello — I am Eduardo’s AI agent (not Eduardo). Confirm you are not a bot below, then ask about his work, skills, or how to get in touch.";
