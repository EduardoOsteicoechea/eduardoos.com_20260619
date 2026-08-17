# Milestone: Homescool teacher→student spaces — 2026-08-17

## Status: SHIPPED on `master` (S3 prefix → `homeschool/`; links now DynamoDB-durable)

| Commit | Message |
|--------|---------|
| `b9c51ca` | feat/test: Homescool student registry APIs and S3 folder scaffold |
| `4cff05e` | feat/test: Homescool UI routes, learning workspace, and nginx pretty URLs |
| `ffd7872` | fix: Homescool S3 objects under bucket-root `homeschool/` (not `media/homescool/`) |
| `9f2415c` | fix: persist Homescool teacher→student links in DynamoDB (`eduardoos_catalog`) |

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
| `POST` | `/api/homescool/students` | Teacher; body `{ studentEmail }`; user must exist; no self; **idempotent** (existing pair → 200 + `existing:true`) |
| `GET` | `/api/homescool/students` | Teacher’s links only |
| `GET` | `/api/homescool/students/{slug}` | Teacher owns that slug |
| `GET` | `/api/homescool/students/{slug}/folders/{folder}` | Teacher owns student |
| `GET` | `/api/homescool/learning` | Links where JWT is the student |
| `GET` | `/api/homescool/learning/{teacherSlug}/folders/{folder}` | JWT must be that student |

Folders: `portfolio`, `period`, `skills`, `study_section`, `tasks`.

## Persistence

### Link registry (was the wipe bug)

- **Root cause (2026-08-17):** first ship used `MemoryStore` only. Any API restart/redeploy cleared
  `homescool_student_links` while S3 `homeschool/{teacher}/{student}/…` markers could remain.
- **Fix:** `OpenLinkStore` follows `HOMESCOOL_BACKEND` or `DATABASE_BACKEND` (production = `dynamodb`).
  Rows live in `HOMESCOOL_TABLE` (default `eduardoos_catalog`) with PK=`APP` and SK prefixes
  `homescool-link:…` / `homescool-by-student:…` (JSON `data` payload).
- Local/tests still default to memory.

### S3 learning objects

- S3 bucket: `S3_BUCKET` (default/example `eduardoos20260607`, region `AWS_REGION` default `us-east-1`).
- S3 keys are **bucket-root** under `homeschool/` (sibling of `media/` and `ifcbim/`, **not** under `media/`):

```
homeschool/{teacherSafe}/{studentSafe}/{folder}/.keep
homeschool/{teacherSafe}/{studentSafe}/{folder}/…objects…
```

`SafeEmailKey`: `@` → `_at_` (same as epams / instrumentalist).

UI brand path stays `/homescool`; S3 prefix is `homeschool/` as created in the bucket.

### Recovery after wipe

If a teacher lost a roster row but S3 folders still exist (e.g. before this fix):
re-register the same student email. Create is idempotent once the durable store is up;
`EnsureStudentFolders` re-puts `.keep` without deleting existing objects.

Example pair: teacher `eduardooost@gmail.com` → student `eliasosteic@gmail.com`
→ slug `eliasosteic_at_gmail.com`, prefix `homeschool/eduardooost_at_gmail.com/eliasosteic_at_gmail.com/`.

## Tests

- Go: `go test ./internal/homescool/...` (register, idempotent re-register, teacher isolation, learning authz, OpenLinkStore fallback, MemoryStore contract)
- Frontend: `npm run test:homescool`; `npm run build`
