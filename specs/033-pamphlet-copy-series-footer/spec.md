# Feature 033 — Pamphlet copy, series grouping, static footers

## Status

Active (2026-08-27).

## Problem

The pamphlet cloud list is a flat row of `.epam` files. Duplicating a pamphlet means re-creating header/body by hand. Articles (`/articulos`) are also a flat list even though pamphlets already carry `series` / `series_chapter`. Contact “info” in the page footer is re-typed on every pamphlet instead of living as a reusable static profile.

## Goals

### 1. Create copy (cloud list, per row)

- In **Open → From the cloud**, each pamphlet row has **Crear copia**.
- Copy does **not** require opening the source first.
- Server clones the full document (header, columns, footer, template type, images).
- New cloud id (UUID). File/id are **not** suffixed.
- **Title** (Dynamo meta + `header.title`) becomes `{sourceTitle}_{n}` where `n` is the smallest integer ≥ 1 whose title is not already used by that user.
  - Copying `Foo` → `Foo_1`, then `Foo_2`.
  - Copying `Foo_1` → `Foo_1_1` (suffix is applied to the copied pamphlet’s current title).
- After copy, the cloud list refreshes in place; the editor stays on whatever was already open.

### 2. Group by series → chapter

- Cloud list uses the same tree as `GET /api/epams/series-tree`: **series → chapter → pamphlet** (unassigned buckets `(sin serie)` / `(sin capítulo)`).
- `/articulos` shows an **expand/collapse** tree (series, then chapters, then article cards). Default: series and chapters **expanded**. Crawl-only flat links remain in the DOM.
- Public HTML index (`GET /api/articles/index.html`) nests the same tree for crawlers.

### 3. Static footer profiles (snapshot **and** linked)

Reusable named footers (the info): `action`, `message`, `label1`/`value1` … `label4`/`value4` (WhatsApp, Teléfono, Dirección, Actividades by default).

- Authenticated CRUD: `GET/POST /api/epams/footers`, `PUT/DELETE /api/epams/footers/{id}`.
- Storage: Dynamo `eduardoos_static_pamphlet_footers` (PK `userId`, SK `footerId`) when `EPAMS_BACKEND=dynamodb`; memory otherwise.
  - Do **not** reuse legacy `eduardoos_pamphlet_footers` (PK `userId`, SK `pamphletId` — different product shape).
- Pamphlet route: Header Dynamic Menu **Pie estático** opens a manager (create / edit / delete) even with no pamphlet open.
- When a pamphlet **is** open, each profile offers:
  - **Copiar** (`footer_bind: "snapshot"`): write fields into this pamphlet; later edits to the master do **not** change it.
  - **Vincular** (`footer_bind: "linked"`): write fields now **and** keep `footer_profile_id`; `GET` pamphlet (and public article) **overlays** the current master footer.
- Footer fields stay editable on the sheet after either apply.
- Editing footer chrome while `linked` **unlinks** to `snapshot` (local copy; master unchanged).
- Missing profile on overlay: keep the last stored footer bytes (no error).

## Non-goals

- Copying local (device) files from the cloud list.
- Auto-rewriting every linked `.epam` S3 body when a master footer is saved (read-time overlay is enough).
- Header profiles, shared footers across users, or public footer CRUD.
- Changing PDF geometry.

## Acceptance

- [x] `POST /api/epams/{id}/copy` (JWT) returns `{meta,document}` with new `epamId` and title suffix; 404/401 as usual.
- [x] Next suffix skips titles that already exist for that user.
- [x] Cloud open list is grouped series → chapter; each leaf has Crear copia.
- [x] `/articulos` expand/collapse tree matches series/chapter metadata.
- [x] Footer profiles CRUD; apply snapshot vs linked; GET overlay for linked; unlink on local footer edit.
- [x] `go test ./internal/content/...` green; frontend `npm run build` green.

## Affected paths

- `specs/033-pamphlet-copy-series-footer/spec.md`
- `backend/internal/content/**`
- `backend/cmd/server/main.go`
- `frontend/src/lib/pamphlet-generator/**`
- `frontend/src/lib/epams.ts`, `frontend/src/lib/articles.ts`, `frontend/src/lib/seriesTree.ts`
- `frontend/src/components/Articles/**`
- `deploy/aws/create-pamphlet-footers-table.sh`, deploy env / README

## Telemetry

- `epams.copy` — user, sourceId, newId, newTitle
- `epams.footer.save|list|delete` — user, footerId
- `epams.get` already logs; overlay is silent unless profile lookup fails (warn)
- `articles.list_html` — log series count when grouped
