# Feature 023 — Network activities (fan-out + per-church occurrence reports)

## Status

**Ready to implement** (clarified 2026-08-20).

## Problem

Church workspace has local Actividades display and a read-only Red tab. Needed: define an activity once at **network** level; every local church sees a card; each church files **occurrence reports**; network rollup is **read-only**.

## Locked clarifications

| # | Decision |
|---|----------|
| 1 | Create/edit network activity definition: **platform admin** and any **`church-admin`** of a church in that denom |
| 2 | Legacy per-church activities: **hide from Actividades tab**; keep APIs/overview/`/church/activity` for now |
| 3 | Participantes: **multi-select, no cap** + **bulk select by church** |
| 4 | **Multiple occurrences** per church per activity (same day allowed — e.g. sectors); key by `occurrenceId`, not date alone |
| 5 | Member pool: **union of all members** of all local churches in the denom, **labeled by church** in dropdowns |
| 6 | **New top-level workspace tab** (e.g. `Red actividades` / `Actividades de red`) — not nested inside Red |
| 7 | Occurrence form: **any `church-member` or `church-admin`** of that church |
| 8 | Photos: **no max count**; client compress large images to **≤ 1 MB**; allow **jpeg / png / webp** |
| 9 | Deletes: **soft-delete** (`deletedAt`) so data is retained; UI hides soft-deleted by default |

## Goals

### A. Network activity definition

- Fields: **name**, **description**.
- Stored once under the denomination group.
- Visible as a card on every local church’s **Actividades** tab (and on the new network-activities tab).

### B. Church → Actividades → card → occurrence form

Form fields:

1. Lugar (text)
2. Fecha (date)
3. Reportero (single select — members union, labeled by church)
4. Participantes (multi-select + bulk-by-church)
5. Registro fotográfico (upload grid → thumbnails; lightbox prev/next/close; compress ≤1 MB)
6. Descripción (textarea)
7. Personas a contactar (repeatable: nombre, dirección, teléfono, interés)

One save = one **occurrence** (`occurrenceId`) for that church + network activity. Many per day allowed.

### C. New tab — network rollup (read-only)

- Card per network activity.
- Open → section per local church → card per occurrence: first-image thumb + stats (fecha, lugar, reportero, #participantes, #interesados, #imágenes).
- Click → full detail **read-only**. Edit only via church form (B).

## Non-goals

- Migrating/removing legacy `Activity` / `ActivityReport` APIs in this feature.
- Hard-delete of definitions or occurrences.
- Unauthenticated access.

## Data model

```
church/groups/{groupId}/network-activities/{activityId}/activity.json
  {
    id, name, description, denominationId,
    createdBy, createdAt, updatedAt,
    deletedAt?: string
  }

church/{denom}/{churchId}/network-activities/{activityId}/occurrences/{occurrenceId}/occurrence.json
  {
    id, activityId, churchId, denominationId,
    date, place,
    reporterMemberKey,          // email (stable)
    participantMemberKeys[],    // emails
    description,
    contacts: [{ name, address, phone, interest }],
    imageNames[],
    createdBy, createdAt, updatedBy, updatedAt,
    deletedAt?: string
  }

church/{denom}/{churchId}/network-activities/{activityId}/occurrences/{occurrenceId}/images/{filename}
```

## API

| Method | Path | Authz |
|--------|------|-------|
| GET | `/api/church/groups/{groupId}/network-activities` | member of any church in group / platform admin |
| POST | same | platform admin or church-admin in group |
| PUT | `/api/church/groups/{groupId}/network-activities/{id}` | same as POST |
| DELETE | soft | same as POST → set `deletedAt` |
| GET | `/api/church/groups/{groupId}/network-activities/{id}/rollup` | same as GET list |
| GET | `/api/church/{denom}/{churchId}/network-activities` | church member/admin |
| GET | `/api/church/{denom}/{churchId}/network-member-pool` | church member/admin — union labeled by church |
| GET/POST | `.../network-activities/{id}/occurrences` | GET any member; POST any member of that church |
| GET/PUT | `.../occurrences/{occurrenceId}` | GET any member of church or rollup reader; PUT member of that church |
| DELETE | soft occurrence | member of that church (or church-admin / platform admin) |
| POST | `.../occurrences/{occurrenceId}/images` | multipart; writer |
| GET | `.../occurrences/{occurrenceId}/images/{name}` | reader |

## UI

| Surface | Behavior |
|---------|----------|
| Workspace tab **Actividades** | Network-activity cards only (legacy list hidden). Click → occurrence list for this church + “nueva” → form |
| New tab **Actividades de red** | Create network activity (if allowed) + cards → rollup read-only |
| Red tab | Unchanged (denom / siblings metadata) |
| `/church/overview`, `/church/activity` | Unchanged (legacy) |

## Acceptance

- [x] Spec matches locked table above.
- [x] Network activity CRUD (soft-delete); fans out as cards on every church Actividades.
- [x] Occurrence form fields 1–7; multi same-day; photo compress ≤1 MB; lightbox.
- [x] Bulk select participantes by church; dropdowns show church label.
- [x] New tab rollup: per-church → per-occurrence cards + stats; detail read-only.
- [x] Soft-deleted hidden in default lists; data retained in S3.
- [x] Church package tests + FE build green; commit + push.

## Affected paths

- `specs/023-network-activities/spec.md`
- `backend/internal/church/` (models, keys, handlers, store, authz, tests)
- `frontend/src/lib/church.ts`
- `frontend/src/components/Church/ChurchDetailPage.tsx` (+ CSS / subcomponents as needed)
