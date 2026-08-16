# Cutover plan — Eduardo OS Next → production

**Status (2026-08-16): HUMAN APPROVED — production cutover executed.**

`https://eduardoos.com` (deploy.yml → nginx 443 → host API `:3000`) serves **Eduardo OS Next**.
Staging remains available on `:8080` / backend `:3001` as a secondary stack.

## Goals

- Zero data loss: keep S3 buckets and DynamoDB tables as-is.
- Zero surprise downtime: staging rehearsal first, then nginx/API switch.
- Rollback: keep the previous release artifacts ready for one release cycle.

## Gates (cutover)

- [x] Explicit human approval to finish migration to production deploy
- [x] Staging redeployed with updated `SMTP_PASS` (spaces stripped; length metadata only in CI)
- [x] Production `deploy.yml` builds Next `.env` (`ADDR=:3000`, quoted env, Dynamo/S3/APS/PayPal/SMTP)
- [x] Host `eduardoos.service` runs Next binary on `:3000` (old `bin/eduardoos` → `bin/eduardoos.prev`)
- [x] Nginx HTML root → `./eduardoos-next/frontend/dist` (old `./frontend/dist` retained on disk)
- [x] JWT_SECRET unchanged (no rotation)
- [x] Day-one gaps documented below (accepted)

## Preconditions (historical)

- [x] Auth against existing `eduardoos_users` (same password hash scheme)
- [x] Frontend build succeeds on target EC2 size (Node heap)
- [x] Backend `/health` green; nginx `/api/` proxies to Next binary
- [ ] Spec `001-platform-parity` fully converged — **partial; ship with accepted gaps**
- [ ] Full product surface (PDF / That Open / playlists Dynamo / PayPal IPN / edebat LLM) — **deferred**

## Data contracts (must not change without a migration)

Documented in `specs/001-platform-parity/data-contracts.md`.

## What production runs now

| Surface | Artifact |
|---------|----------|
| HTTPS `:443` static | `eduardoos-next/frontend/dist` (Docker nginx `/usr/share/nginx/html`) |
| API `:3000` | `eduardoos-next/backend/bin/eduardoos-next` via `eduardoos.service` |
| Staging `:8080` | Same Next frontend mount + `eduardoos-next.service` on `:3001` |
| Env files | `~/…/.env` and `~/…/eduardoos-next/.env` (CI uploads both) |

Scripts: `eduardoos-next/deploy/deploy-remote-production.sh` (called from `deploy/ec2/deploy-remote.sh`).

## Accepted day-one gaps

Ship anyway per explicit cutover order — not blockers for live Next:

- **Pamphlet PDF** — stub single-page PDF (`pkg/pdf.BuildSamplePDF`); full landscape Roboto layout parity deferred.
- **That Open / OpenBIM 3D viewer** — IFC upload/list/download works; no web-ifc / three viewer yet.
- **Playlists** — list/create/tracks + HTML5 audio; no full worship builder / S3 audio library / Dynamo persistence parity.
- **Payments / PayPal** — intents + hosted button + status; no IPN webhook / Dynamo entitlement grants after checkout.
- **Edebat** — list/create/turn (memory); no LLM referee / Dynamo / S3 `.edebat` bodies.

## Rollback (one release cycle)

Old monolith binary and old Astro `frontend/dist` stay on disk; do **not** delete `frontend/` or `cmd/` from git.

### Fast rollback (on EC2)

```bash
APP=~/eduardoos.com_20260619
# 1) Point nginx HTML root back to legacy frontend
cd "$APP"
# Temporarily edit docker-compose.ec2.yml (and base compose) html volume to:
#   ./frontend/dist:/usr/share/nginx/html:ro
docker compose -f docker-compose.yml -f docker-compose.ec2.yml up -d --force-recreate nginx

# 2) Restore previous monolith binary as eduardoos.service
sudo systemctl stop eduardoos
sudo cp -f "$APP/bin/eduardoos.prev" "$APP/bin/eduardoos"
# Reinstall legacy unit template (PORT=3000, ExecStart=bin/eduardoos):
sed -e "s|@APP_DIR@|$APP|g" -e "s|@DEPLOY_USER@|$(whoami)|g" \
  deploy/ec2/eduardoos.service.template | sudo tee /etc/systemd/system/eduardoos.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl start eduardoos
curl -sf http://127.0.0.1:3000/health
```

One-liner sketch (after compose volume edit + unit restore):

```bash
sudo systemctl stop eduardoos && sudo cp -f ~/eduardoos.com_20260619/bin/eduardoos.prev ~/eduardoos.com_20260619/bin/eduardoos && sudo systemctl start eduardoos
```

## Explicit non-goals for day-one cutover

- Rewriting DynamoDB table names
- Moving S3 objects to new prefixes without dual-read
- Changing JWT secret (invalidates sessions) unless coordinated
