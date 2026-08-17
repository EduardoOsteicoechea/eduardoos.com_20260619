# Milestone: Church líderes nombre/apellido/contacto — 2026-08-17

## Status: SHIPPED

Extends Church register líderes cards under `eduardoos-next` without changing Greek.

## What shipped

1. **Líderes card fields** on `/church/register`:
   - **nombre** (`firstName`) — required
   - **apellido** (`lastName`) — required
   - **teléfono** (`phone`) — optional
   - **correo** (`email`) — optional
   - roles multi-select + +/− unchanged

2. **Dropdown liderazgo** shows `"nombre apellido"`.

3. **Backend** `Leader` JSON + `normalizeLeaders` / `leaderDisplayName`:
   - New rows require firstName + lastName
   - Legacy `{ name, roles[] }` still accepted on read
   - Optional phone/email validated when present

4. Detail / overview list leaders via `leaderDisplayName`.

## Tests

- `go test ./internal/church/...`
- `npm run test:church`
