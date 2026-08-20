# Milestone: Site agent in-chat links (no chrome buttons) — 2026-08-19

## Shipped (spec 021 revision)
- Removed Email/WhatsApp chrome buttons from dock (`showDirectLinks: false`).
- Home vs contact docks identical except welcome strings.
- In-chat: Markdown `mailto:` + https; WhatsApp action chip; email-notify confirmation.
- Prompt: include Markdown contact links; no auto-`window.open`.
