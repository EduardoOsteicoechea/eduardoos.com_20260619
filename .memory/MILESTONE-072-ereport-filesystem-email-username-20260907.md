# Milestone — eReport on the VPS filesystem (072 pass 1) 2026-09-07

Spec 072 **Amendment A**: the owner directory is keyed by **email + username**, not a
Mongo `userId`. The original lock depended on a platform identity migration that has
not happened here (this repo still authenticates with DynamoDB users and a JWT whose
only identity claim is the email), so delivery split into two passes.

## Pass 1 — shipped

- `FSObjectSpace` (`backend/internal/ereport/fsobjects.go`) stores every eReport object
    10|  as a file under `EREPORT_MEDIA_ROOT` (prod `/var/www/eduardoos.com/media/ereport`).
- Disk layout `<root>/<username>/<safe-email>/orgs/<org-id>/reports/<report-id>/`;
  invites stay at `<root>/invites/<id>.json`.
- **Email is authoritative, username is only a label.** Lookup reuses an existing
  `*/<safe-email>` directory, so editing a display `Name` never moves or orphans files.
- Username = `Name` slugified (accent-folded, lowercase, dash-joined, ≤64 chars),
  falling back to the email local part, then `user`.
- Object keys stay email-keyed (`ereport/<safe-email>/…`); only the storage layer knows
  about the username segment, so no handler/API/frontend contract changed.
- Atomic writes (temp file + rename), dir `0750`, file `0640`, traversal-safe keys.
    20|- **S3 removed from eReport**: no `awsx`/`aws-sdk-go` imports, no `S3_BUCKET`.
  `OpenObjectSpace(ctx, users)` returns filesystem or memory — never S3.
- `.env.example` gains `EREPORT_MEDIA_ROOT`; systemd template gains `UMask=0027`.

Tests: `go test ./internal/ereport/...` covers layout, rename stability, traversal
rejection, atomic overwrite, permissions, list/delete pruning, invites, and the
memory fallback. Full `go vet ./...` + `go test ./...` green.

## Pass 2 — deferred

Identity migration (cookie sessions, rotating refresh tokens, CSRF), invite OTP,
    30|image extraction to files, and vendored html2canvas/jsPDF.

Spec: `specs/072-ereport-vps-filesystem/spec.md`
