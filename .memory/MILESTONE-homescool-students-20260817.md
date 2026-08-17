# Milestone: Homescool teacher→student spaces — 2026-08-17

## Status: SHIPPED on `master` (S3 prefix → `homeschool/`)

| Commit | Message |
|--------|---------|
| `b9c51ca` | feat/test: Homescool student registry APIs and S3 folder scaffold |
| `4cff05e` | feat/test: Homescool UI routes, learning workspace, and nginx pretty URLs |
| *(follow-up)* | fix: Homescool S3 keys under bucket-root `homeschool/` (not `media/homescool/`) |

## Product routes (brand: Homescool → `/homescool/*`)

| Route | Role |
|-------|------|
| `/homescool` | Hub + CTAs (subscription-gated) |
| `/homescool/register-student` | Teacher registers an **existing** platform user as student |
| `/homescool/students` | Teacher roster |
| `/homescool/students/{slug}` | Pretty student workspace (nginx → `workspace` shell) |
| `/homescool/students/workspace?student={slug}` | Static-safe workspace shell |
| `/homescool/learning` | Student view of their space(s) under teachers |

## API (JWT)

| Method | Path | Authz |
|--------|------|-------|
| `POST` | `/api/homescool/students` | Teacher; body `{ studentEmail }`; user must exist; no self; no duplicate |
| `GET` | `/api/homescool/students` | Teacher’s links only |
| `GET` | `/api/homescool/students/{slug}` | Teacher owns that slug |
| `GET` | `/api/homescool/students/{slug}/folders/{folder}` | Teacher owns student |
| `GET` | `/api/homescool/learning` | Links where JWT is the student |
| `GET` | `/api/homescool/learning/{teacherSlug}/folders/{folder}` | JWT must be that student |

Folders: `portfolio`, `period`, `skills`, `study_section`, `tasks`.

## Persistence

- Logical table `homescool_student_links` (memory store today; DynamoDB-ready shape in `internal/homescool`).
- S3 bucket: `S3_BUCKET` (default/example `eduardoos20260607`, region `AWS_REGION` default `us-east-1`).
- S3 keys are **bucket-root** under `homeschool/` (sibling of `media/` and `ifcbim/`, **not** under `media/`):

```
homeschool/{teacherSafe}/{studentSafe}/{folder}/.keep
homeschool/{teacherSafe}/{studentSafe}/{folder}/…objects…
```

Folders: `portfolio`, `period`, `skills`, `study_section`, `tasks`.

`SafeEmailKey`: `@` → `_at_` (same as epams / instrumentalist).

UI brand path stays `/homescool`; S3 prefix is `homeschool/` as created in the bucket.

## Tests

- Go: `go test ./internal/homescool/...` (register, duplicate, teacher isolation, learning authz)
- Frontend: `npm run test:homescool`; `npm run build`

## Non-goals

- File upload into student folders (list + empty cards only for now)
- DynamoDB production table wiring (memory default; schema documented)
