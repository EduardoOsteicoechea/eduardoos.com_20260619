# Feature 001 — Platform parity (greenfield)

## Status

Specified — implementation proceeds task-by-task under this folder.

## Problem

Production Eduardo OS works but the monorepo is hard to evolve. We need a clean rewrite that can eventually replace production **without losing S3/DynamoDB data** and without breaking live deploy while we build.

## Goals

1. Ship a self-contained app under `eduardoos-next/` (`frontend`, `backend`, `revitapi`).
2. Match must-have product capabilities listed below.
3. Speak the **same data contracts** as production (see `data-contracts.md`).
4. Keep production deploy on the old tree until cutover checklist passes.

## Non-goals (this feature)

- Editing or deleting the parent production codebase.
- Changing live nginx/`deploy.yml` targets.
- Inventing new DynamoDB table names for existing domains.

## Users

- **Visitor:** home, contact/assistant, public media where applicable.
- **Signed-in user:** pamphlets (epams), playlists, articles, BIM, subscriptions, profile.
- **APS admin** (`eduardooost@gmail.com`): Design Automation trigger + hub/registry explorer.

## Must-have capabilities (parity checklist)

### Auth
- Register, login, OTP verify, logout
- Password reset by email
- JWT sessions compatible with existing hash scheme (`sha256:` prefix as today) OR documented migration

### Content & tools
- Home (brand + assistant gate)
- Contact
- Pamphlet editor (open/create local `.epam` + cloud epams)
- Music / playlists
- Articles
- OpenBIM (IFC upload/list/view against `ifcbim/` + `eduardoos_ifcbim`)
- Edebat
- Subscribe / entitlements
- APS admin: work item trigger + **panel listing registered DA assets and hub items**

### Platform
- Gateway health
- Correlation ID on API calls
- Static frontend served behind nginx (cutover-time)

## Success criteria

- [ ] Each must-have has tasks with tests-first implementation notes
- [ ] Backend can list/get user + epam against real or local-compatible stores
- [ ] Frontend shells for routes exist and call next APIs
- [ ] APS explorer shows bundles/activities and hub projects/items for admin
- [ ] `CUTOVER.md` gates still all unchecked until explicitly approved

## Out of scope until later specs

- Pixel-perfect pamphlet PDF parity polish beyond “usable”
- Full observability UI clone (logger/tester) — may follow as `002-observability`
