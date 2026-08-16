# Eduardo OS Next — Constitution

## Purpose

Rebuild Eduardo OS as a clean, spec-driven codebase (`frontend` / `backend` / `revitapi`) while the production monorepo continues to serve users. Cutover only after stability and data-contract parity.

## Principles

1. **Spec before code.** No feature lands without `specs/<id>/spec.md` → plan → tasks. Order inside each task: **tests → implementation → refactor**.
2. **Isolation.** Work under `eduardoos-next/` must not edit production app paths or production deploy workflows until `CUTOVER.md` gates pass.
3. **Data continuity.** Prefer existing AWS resources. Changing DynamoDB keys, S3 prefixes, or password hashes requires an explicit migration spec.
4. **Small surfaces.** Tiny modules, single-responsibility handlers, plain CSS (no Tailwind/CSS-in-JS), idiomatic Go `net/http` + chi.
5. **Observable by default.** Correlation IDs on API hops; human-readable errors for operators. **UI rule:** any server/API failure shown to a user must open a modal with a copyable diagnostic block (status, message, correlation id, body excerpt) — never console-only.
6. **Security.** Public routes allowlisted; JWT for private APIs; APS admin allowlisted; RBAC roles `admin`|`user` plus per-service subscription entitlements; never commit secrets.
7. **English UI** for product chrome unless a feature spec says otherwise.
8. **Prove before cutover.** Staging + checklist beat optimism.

## Non-negotiables

- Do not delete or “clean” the parent production tree as part of next development.
- Do not point `eduardoos.com` at this tree without cutover approval.
- Do not invent parallel DynamoDB tables for the same domain objects without a dual-write plan.

## Stack defaults (plan may refine per feature)

- Frontend: Astro + React islands, plain CSS, theme tokens `--site-*`
- Frontend design skills (required for UI work): `.cursor/skills/frontend-design/SKILL.md` + `.cursor/skills/bim-aec-frontend/SKILL.md` (blueprint vernacular; light/dark via `eduardoos-theme` + Header Theme toggle)
- Visitor AI agents (home/contact/profile chat): `.cursor/skills/agent-voice/SKILL.md` — agents never impersonate Eduardo; tone professional / relaxed / concrete / didactic. Prompt source: parent `pkg/contact/agent_identity.go`.
- Activity bar icons: theme-token / `currentColor` only — legible in both light and dark (no hardcoded light strokes on light chrome)
- Backend: Go 1.23+, chi, AWS SDK for DynamoDB/S3
- Revit/APS: Design Automation + Data Management under `revitapi/` + backend APS client
- Deploy (future): Docker/nginx/EC2 patterns compatible with current ops

## Definition of done (every feature)

- Spec criteria covered by automated tests where feasible
- `go test` / frontend checks green for touched packages
- README or spec updated if contracts change
- No secrets in git
