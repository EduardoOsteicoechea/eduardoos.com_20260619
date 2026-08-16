# Spec: The Instrumentalist (002)

## Summary

**The Instrumentalist** is a signed-in product for self-evaluating ideas. Users build a
**belief hierarchy** (schematic tree of idea cards, weights, and group links), ask a
formal-logic AI agent to **analyze** coherence, and **chat** about a proposed topic
with hierarchy-weighted validation/refutation. Sessions persist as **`.instru`**
documents (download + S3 when configured).

## Access (v1)

- **JWT required** for all `/api/instrumentalist/*` routes and the UI (AuthGate + ServiceGate).
- Catalog service id: `instrumentalist` (subscription-ready; admin bypass via existing RBAC).
- Prefer public-to-signed-in with entitlement gate (same pattern as Debate App / Pamphlet).

## Agent identity

- Formal-logic **AI agent**, never Eduardo (see `.cursor/skills/agent-voice`).
- English UI chrome; replies may follow visitor language when the LLM is wired.

## UI layout

1. **Default view**: topic field + formal-logic **chat** only (no tree on screen).
2. **Header Dynamic Menu** (same host as Pamphlet): **Beliefs** toggle opens/closes the belief-tree canvas panel.
3. **When tree open**: `@xyflow/react` editor + **Analyze**; analysis subpanel opens on Analyze (**Re-analyze** after edits).
4. Chat always available; belief tree context is sent with each turn whether the canvas is open or closed.
5. Light/dark via existing `--site-*` tokens; Header → Services → Instrumentalist.
6. **Delete**: visible × on selected cards + Backspace/Delete; connected edges removed.
7. **Cables**: drag from node handles; hierarchy within a group; group cables for membership.

## Belief tree domain

- **Hierarchy**: higher nodes have greater weight in topic evaluation.
- **Groups**: hierarchy may exist within a group; not across groups (edges encode group membership / parent links).
- Each **idea card**: text + numeric **weight**; edit tray on the node.
- **Cables/nodes**: React Flow edges between ideas/groups.

## Persistence

- Format: `.instru` JSON (see `data-contracts.md`).
- S3 prefix: `media/instrumentalist/{user}/…` when `S3_BUCKET` (or `INSTRUMENTALIST_S3_BUCKET`) is set.
- Memory fallback for local/dev when S3 is unset.
- Client can download the current document as `{title}.instru`.
- **v1 UX**: each user has **one default hierarchy** — always loaded on open; autosave / Save **upserts** that document (list may still return older rows; UI uses the newest).

## API (JWT)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/instrumentalist` | List user’s documents (meta) |
| POST | `/api/instrumentalist` | Create/save document body |
| GET | `/api/instrumentalist/{id}` | Get full `.instru` document |
| PUT | `/api/instrumentalist/{id}` | Update full document |
| POST | `/api/instrumentalist/{id}/analyze` | Formal-logic coherence analysis |
| POST | `/api/instrumentalist/{id}/chat` | Chat turn with hierarchy context |

LLM: DeepSeek when `DEEPSEEK_API_KEY` is set; otherwise `503` with a clear message
(UI → `ServerErrorModal`). Tests inject a mock LLM.

## Graph library

**Chosen: `@xyflow/react` (React Flow v12)** — React 19 compatible, Astro island–friendly,
plain CSS themable with `--site-*`, maintained successor to `reactflow`. Documented in
`plan.md` and README.

## Out of scope (v1)

- PayPal IPN / Dynamo entitlements (memory entitlements + admin grant like other services).
- Cross-user sharing of `.instru` files.
