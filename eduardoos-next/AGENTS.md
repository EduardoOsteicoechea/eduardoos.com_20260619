# Eduardo OS Next — Cursor / Spec Kit notes

Work **only** under `eduardoos-next/`.

Do **not** modify parent production paths:

- `frontend/` (parent)
- `cmd/`, `internal/`, `pkg/` (parent)
- `deploy/`, `nginx/`, `.github/workflows/deploy.yml`

Workflow: read `.specify/memory/constitution.md` → active feature in
`.specify/feature.json` → follow `specs/.../tasks.md` with tests before code.

When Spec Kit CLI is available:

```bash
uv tool install specify-cli
cd eduardoos-next
specify init . --here --integration cursor
```

Constitution and `001-platform-parity` are already seeded manually so work can
proceed before CLI init.
