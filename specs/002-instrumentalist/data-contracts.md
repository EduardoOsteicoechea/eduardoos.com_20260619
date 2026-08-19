# Data contracts: The Instrumentalist (002)

## S3

| Item | Value |
|------|--------|
| Bucket | Same as app media (`S3_BUCKET` / `eduardoos20260607`) |
| Optional override | `INSTRUMENTALIST_S3_BUCKET` |
| Prefix | `media/instrumentalist/{user}/` |
| Object key | `media/instrumentalist/{email_at_}/{id}.instru` |
| Content-Type | `application/json` |

`{email_at_}` = email with `@` → `_at_` and `/` → `_` (same sanitization as epams).

When no bucket is configured, documents live in process memory only (local/dev).

## `.instru` document shape

```json
{
  "type": "instru",
  "version": 1,
  "id": "uuid",
  "userId": "user@example.com",
  "title": "Session title",
  "topic": "Proposed topic under evaluation",
  "beliefTree": {
    "nodes": [
      {
        "id": "n1",
        "kind": "idea",
        "text": "Premise text",
        "weight": 1.0,
        "groupId": "g1",
        "position": { "x": 120, "y": 80 }
      },
      {
        "id": "g1",
        "kind": "group",
        "text": "Belief group A",
        "weight": 0,
        "groupId": "",
        "position": { "x": 40, "y": 40 }
      }
    ],
    "edges": [
      {
        "id": "e1",
        "source": "n1",
        "target": "n2",
        "kind": "hierarchy"
      },
      {
        "id": "e2",
        "source": "g1",
        "target": "n1",
        "kind": "group"
      }
    ]
  },
  "messages": [
    { "role": "assistant", "text": "…", "at": "2026-08-16T21:00:00Z" },
    { "role": "user", "text": "…", "at": "2026-08-16T21:01:00Z" }
  ],
  "analyses": [
    {
      "id": "a1",
      "summary": "Short coherence verdict",
      "detail": "Longer formal-logic notes",
      "at": "2026-08-16T21:02:00Z"
    }
  ],
  "createdAt": "2026-08-16T21:00:00Z",
  "updatedAt": "2026-08-16T21:05:00Z",
  "s3Key": "media/instrumentalist/user_at_example.com/uuid.instru"
}
```

### Edge kinds

| Kind | Meaning |
|------|---------|
| `hierarchy` | Parent → child within a group (higher weight upstream); both ends must be `idea` nodes sharing the same `groupId` |
| `group` | Membership cable: `source` = group node, `target` = idea; sets `idea.groupId` |

### Default document (v1 UX)

Clients load the user's newest `.instru` on open (or create one if none). Save upserts that document — one active hierarchy per user for now.

### Node kinds

| Kind | Meaning |
|------|---------|
| `idea` | Editable belief card (text + weight) |
| `group` | Group container label node |

## API list response

```json
{
  "count": 1,
  "documents": [
    {
      "id": "…",
      "title": "…",
      "topic": "…",
      "updatedAt": "…",
      "s3Key": "…"
    }
  ]
}
```

## Env

| Variable | Role |
|----------|------|
| `S3_BUCKET` / `INSTRUMENTALIST_S3_BUCKET` | Enable S3 persistence |
| `DEEPSEEK_API_KEY` | Enable analyze/chat LLM |
| `DEEPSEEK_BASE_URL` | Default `https://api.deepseek.com` |
| `DEEPSEEK_MODEL_EXPERT` | Default model for instrumentalist |

## Platform note

Appended to `001-platform-parity/data-contracts.md` S3 prefix table:
`media/instrumentalist/{user}/` — Instrumentalist `.instru` bodies.
