# Milestone: The Instrumentalist (eduardoos-next) — 2026-08-16

## Shipped

| Area | Detail |
|------|--------|
| Spec | `eduardoos-next/specs/002-instrumentalist/` (spec, plan, tasks, data-contracts) |
| Library | `@xyflow/react` (React Flow v12) for belief tree |
| Route | `/instrumentalist` + Header Services link |
| Access | JWT + `ServiceGate` service id `instrumentalist` (catalog $3/mo; admin bypass) |
| API | `GET/POST /api/instrumentalist`, `GET/PUT …/{id}`, `POST …/{id}/analyze`, `POST …/{id}/chat` |
| Storage | Memory + optional S3 `media/instrumentalist/{user}/{id}.instru` |
| LLM | DeepSeek when `DEEPSEEK_API_KEY` set; else 503 → ServerErrorModal |
| Agent | Non-impersonation formal-logic voice (`INSTRUMENTALIST_AGENT_WELCOME`) |

## UX (follow-up)

| Area | Detail |
|------|--------|
| Default view | Topic + formal-logic chat only |
| Header menu | Beliefs toggle in `#header-dynamic-menu-host` (Pamphlet pattern; does not break Pamphlet) |
| Tree panel | Opens on Beliefs; Analyze when open |
| Delete | × on nodes + Backspace/Delete; edges pruned |
| Cables | Larger handles, Loose connection mode, hierarchy/group validation |
| Persistence | Single default `.instru` per user (newest on open; upsert save) |

## `.instru` shape

`type: instru`, `version: 1`, `beliefTree.nodes/edges`, `messages`, `analyses`, topic/title timestamps.
