# Plan: The Instrumentalist (002)

## Library choice

| Candidate | Fit | Decision |
|-----------|-----|----------|
| `@xyflow/react` | React 19, CSS import themable, nodes/edges/handles, Astro `client:load` | **Selected** |
| `reactflow` (legacy) | Older package name; superseded by `@xyflow/react` | Skip |
| Custom SVG | Full control, high cost | Skip for v1 |

Theme: import `@xyflow/react/dist/style.css` then override with Instrumentalist CSS using `--site-*`.

## Architecture

```
frontend/pages/instrumentalist.astro
  → InstrumentalistApp (ServiceGate)
    → BeliefTreePanel (@xyflow/react)
    → AnalyzeSubpanel
    → InstrumentalistChat
backend/internal/instrumentalist
  → memory Store + optional S3 body wrap
  → DeepSeek client (optional)
  → chi JWT routes
```

## Atomic steps

1. Spec + data contracts (this folder) + constitution/README note.
2. Go tests for CRUD + JWT + analyze/chat contracts.
3. Go store + handlers + S3 wrap + LLM client.
4. Catalog id `instrumentalist` + frontend payments list.
5. Frontend lib + page + tree/chat/analyze UI.
6. Header Services link + routeAccess.
7. `go test ./...` + `npm run build` + commit/push.

## Access decision

v1: **JWT required** + `ServiceGate serviceId="instrumentalist"`. Admin always allowed.
Subscription catalog entry ships now; entitlements follow existing memory/admin grant path.
