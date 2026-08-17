# Milestone: Homescool tasks (templates, boards, grading) — 2026-08-17

## Status: SHIPPED on `master` (`821fbff`)

Extends Homescool student spaces with durable task templates, assignment, student
responses (text/md + proof files), and teacher grading across four boards.

## Product UX

### Student (`/homescool/learning` → Tasks)
- Board of **pending** tasks (clickable cards).
- Modal: name, start, end/conclusion, description; paste text/markdown; upload proof files.
- Submit → task moves to teacher **Accionadas**.

### Teacher (`/homescool/students/…` → Tasks)
Four boards:
1. **Pendientes** — assigned, awaiting work (or rejected for redo)
2. **Accionadas** — student submitted / needs review
3. **Listas** — validated (ready until archived)
4. **Archivadas** — archived (end of flow)

Sidebar: **Task templates** (period, study area, time, max score 1–10, description + image).
Dashboard: **Assign tasks** modal — period → study area → pick template cards → dates.

### Score bar (1–10 segments)
| Score | Band | Color |
|-------|------|-------|
| 1–3 | mínimo | red |
| 4–5 | pobre | yellow |
| 6–7 | aprobado | pale lime |
| 8–10 | bueno | green |

Validate → Listas; Reject → back to Pendientes (score retained for feedback).

Workspace shell uses `page-shell--homescool-flush` (padding-left: 0 against the 60px rail).
Folders sidebar toggles from Header Dynamic Menu; preference key
`eduardoos-homescool-folders-open` (`1`/`0`). Header toggle icon is a left-rail +
lines glyph (`currentColor`, activity-bar style). Folders aside uses symmetric
`0.85rem` left/right padding. Teacher kanban boards stack full-width vertically
(Pendientes → Archivadas); student pending cards use the same stacked board layout.

## APIs (JWT)

| Method | Path | Role |
|--------|------|------|
| `POST/GET` | `/api/homescool/task-templates` | Teacher |
| `GET` | `/api/homescool/task-templates/{id}` | Teacher |
| `POST` | `/api/homescool/task-templates/{id}/images` | Teacher multipart |
| `POST/GET` | `/api/homescool/students/{slug}/tasks` | Teacher assign / list boards |
| `POST` | `/api/homescool/students/{slug}/tasks/{id}/grade` | Teacher `{decision,score}` |
| `POST` | `/api/homescool/students/{slug}/tasks/{id}/archive` | Teacher |
| `GET` | `/api/homescool/learning/{teacherSlug}/tasks` | Student |
| `GET` | `/api/homescool/learning/{teacherSlug}/tasks/{id}` | Student |
| `POST` | `/api/homescool/learning/{teacherSlug}/tasks/{id}/submit` | Student multipart/JSON |

Existing register-student + folder listing routes unchanged.

## Persistence

- **DynamoDB** (`HOMESCOOL_TABLE` / `eduardoos_catalog`), same Open* pattern as links:
  - `homescool-tpl:t:{teacher}|id:{id}`
  - `homescool-task:t:{teacher}|s:{student}|id:{id}`
  - `homescool-task-by-student:s:{student}|t:{teacher}|id:{id}`
- **S3**:
  - `homeschool/{teacher}/templates/{templateId}/{file}`
  - `homeschool/{teacher}/{student}/tasks/{taskId}/submission/{file}`

## Email notifications (shared SMTP)

Uses `auth.Handler.SendHTMLMail` → same `SMTP_USER` / `SMTP_PASS` as OTP.
Mail failure is **logged only**; the primary mutation still succeeds.
CTA origin: `PUBLIC_BASE_URL` or `SITE_URL` (default `https://eduardoos.com`).

| Event | Recipients | CTA |
|-------|------------|-----|
| Student registration | Student + teacher confirmation | `/homescool/learning`, teacher workspace |
| Task assigned | Student | `/homescool/learning?folder=tasks&task={id}` |
| Grade validate/reject | Student | same deep link |

HTML style: gallery-atelier limestone / muted steel (`#f2f3f6`, `#3d5a80`, Cormorant/Montserrat/Raleway feel) — no purple SaaS templates.

## Tests

- `go test ./internal/homescool/...` (incl. mail capture + score bands + boards flow)
- `npm run test:homescool`
