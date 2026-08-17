# Milestone: Church register/leader persist errors + Homescool template edit — 2026-08-17

## Status: SHIPPED (this commit)

### Church — clearer persist failures

Creating leaders (`POST /api/church/leaders`) and registering churches
(`POST /api/church`) already returned **502** when Dynamo succeeded but S3
`PutObject` under `church/*` failed (same pattern as Greek). The UI modal often
reads as a generic “server / internal” error.

**Fix:**
- Surface the underlying S3/Dynamo error in the JSON `error` field
  (includes `AccessDenied` when IAM is missing `church/*`).
- Roll back the Dynamo/memory leader row when `leader.json` cannot be written
  (unchanged behavior; covered by unit test).
- Log `church-groups` / `church-leaders` / `church-objects` backends at process
  start for operator diagnosis.
- Nginx prod + staging: exclude `groups` and `leaders` from the church detail
  rewrite (align reserved shells with the spec).
- Register UI: guard against empty success payloads before redirect.

If create still fails after deploy, copy the modal block — it should name S3/IAM
explicitly. Re-apply `deploy/aws/ec2-iam-policy.json` (or the S3 church statement)
on the EC2 role if `AccessDenied` appears.

### Homescool — edit task templates

- `PUT /api/homescool/task-templates/{templateId}` updates name, description,
  period, study areas, duration, max score.
- Task templates sidebar: **Edit** on each row; form switches to “Save changes”.

## Tests

- `go test ./internal/church/...`
- `go test ./internal/homescool/...`
