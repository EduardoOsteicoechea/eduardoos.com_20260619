# Eduardo OS Next — deploy scripts

**Production cutover (2026-08-16):** parent `deploy.yml` serves Next on HTTPS `:443` / API `:3000` via `deploy-remote-production.sh`.

This folder still owns **staging** (`:8080` / `:3001`) as a secondary stack.

## Staging URL

After a successful staging deploy:

```text
http://<EC2_IP>:8080/
http://<EC2_IP>:8080/health
```

Replace `<EC2_IP>` with the value of GitHub secret `EC2_HOST` (or your instance public IP). Production is Next on HTTPS `:443` / API `:3000`.

Open **Security Group TCP 8080** inbound for staging access.

CI smoke treats **on-box** `127.0.0.1:8080` as the required check. Public `http://$EC2_HOST:8080` returning `000` almost always means the SG (or host firewall) still blocks TCP 8080 — not a bad nginx root.

## Production vs staging

| Script | Role |
|--------|------|
| `deploy-remote-production.sh` | Production cutover: Next on `:3000`, builds Next frontend for nginx HTML root |
| `deploy-remote-staging.sh` | Secondary stack only (`:3001` + `:8080`); does not replace production unit |

## How nginx staging is wired

This repo runs edge nginx in Docker (`docker-compose.yml` + `docker-compose.ec2.yml`). Staging uses a **second** conf.d file — never replacing `default.conf`:

| File | Role |
|------|------|
| `eduardoos-next/deploy/nginx-staging.conf` | Source-of-truth template in Next deploy |
| `nginx/eduardoos-next-staging.conf` | Mounted into the nginx container as `/etc/nginx/conf.d/eduardoos-next-staging.conf` |

Compose publishes `8080:8080` and mounts:

- `./nginx/eduardoos-next-staging.conf` → conf.d (alongside default)
- `./eduardoos-next/frontend/dist` → `/usr/share/nginx/eduardoos-next`

`deploy-remote-staging.sh` prefers host `/etc/nginx/conf.d/` when host nginx exists; otherwise it writes/refreshes the monorepo conf and reloads Docker nginx.

## CI workflow

`.github/workflows/deploy-next-staging.yml`

- Triggers: `workflow_dispatch` + push to `master` when `eduardoos-next/**` or this workflow changes
- Concurrency: `deploy-next-staging` (independent of production `deploy-ec2`)
- Builds Next `.env` (ADDR `:3001`, DynamoDB/S3 backends, `DEV_RETURN_OTP=0`)
  - Secrets are **double-quoted** for systemd `EnvironmentFile` safety (`#`, spaces, `$`)
  - `SMTP_PASS` spaces are stripped (Gmail app passwords are 16 chars; UI spaces break SMTP auth)
- SCP `.env` + `deploy-remote-staging.sh`, then runs remote deploy
- Smoke: on-box `:8080` required; public `:8080` warns if SG blocks
  - SSH uses `-n -T`, short `ServerAlive*`, and `timeout 45` around the on-box probe so the step exits immediately after success (no hung half-closed SSH)

### Auth email / GitHub secrets

Required repository secrets (exact names — typos mean the new password never reaches EC2):

| Secret | Purpose |
|--------|---------|
| `SMTP_USER` | Gmail that owns the App Password (typically `eduardooost@gmail.com`) |
| `SMTP_PASS` | Gmail **App Password**, 16 chars, no spaces |

Wiring:

1. `deploy.yml` / `deploy-next-staging.yml` build `.env` from those secrets (spaces/quotes stripped; CI **fails** if length ≠ 16).
2. Production uploads `~/eduardoos.com_20260619/.env` → `eduardoos.service` `EnvironmentFile`.
3. Staging uploads `~/…/eduardoos-next/.env` → `eduardoos-next.service`.
4. **Updating a secret alone does nothing** — you must redeploy (`push` to `master` or `workflow_dispatch`) so `.env` is rewritten and the unit restarts.

On the EC2 host:

```bash
# Production (Next on :3000)
sudo journalctl -u eduardoos -b --no-pager | grep -E 'smtp:|auth\.smtp|auth\.forgot-password|auth\.register|sendResetOTP'

# Staging (Next on :3001)
sudo journalctl -u eduardoos-next -b --no-pager | grep -E 'smtp:|auth\.smtp|auth\.forgot-password|auth\.register|sendResetOTP'
```

Startup must show `smtp: user=… pass_set=true pass_norm_len=16`. Each mail attempt logs: `begin` → `dial` → `hello` → `starttls` → `auth` → `mail_from` → `rcpt_to` → `data` → `quit` → `done` (or `*_failed`). Match UI `trace:` / `X-Correlation-ID` to `[correlation=…]`.

OTP codes are **not** logged on the real-SMTP path. Empty `SMTP_PASS` uses `skip_empty_pass` (body only then, for local/dev). Register returns `502 could not send verification email` if Gmail rejects delivery.

If logs show `auth_failed` / `535 5.7.8`, regenerate a Gmail **App Password**, set GitHub `SMTP_PASS` (exact name) to 16 chars with **no spaces**, then **redeploy**.

## Scripts

| Script | Purpose |
|--------|---------|
| `deploy-remote-production.sh` | Production: Next binary on `:3000` (`eduardoos.service`), backup `bin/eduardoos.prev`, build Next frontend |
| `deploy-remote-staging.sh` | Staging: Next on `:3001` + nginx `:8080` |
| `build-frontend.sh` | `npm ci` + `npm run build` with `NODE_OPTIONS=--max-old-space-size=4096` |
| `run-backend.sh` | Loads `.env`, builds `backend/bin/eduardoos-next` if needed, listens on `ADDR` / `PORT` (default `:3001`) |
| `eduardoos-next-backend.service` | systemd unit template → installed as `eduardoos-next.service` (staging) |
| `nginx-staging.conf` | HTTP :8080 snippet (Docker paths) |
| `smoke.sh` | `curl` `/health` (+ home if `SMOKE_HOME=1`); requires `BASE_URL` |

## Quick start (EC2 secondary)

```bash
# Prefer CI: gh workflow run deploy-next-staging.yml
# Or manually on the host:
cd ~/eduardoos.com_20260619
# ensure eduardoos-next/.env exists
APP_DIR=~/eduardoos.com_20260619 bash eduardoos-next/deploy/deploy-remote-staging.sh
BASE_URL=http://127.0.0.1:8080 ./eduardoos-next/deploy/smoke.sh
```

## Smoke checklist (T051)

- [ ] Backend process up on `:3001` (`systemctl status eduardoos-next`)
- [ ] `http://<EC2_IP>:8080/health` OK
- [ ] Frontend served at `http://<EC2_IP>:8080/`
- [ ] Register / login against Next API
- [ ] Confirm production HTTPS (`https://eduardoos.com`) still healthy after staging-only deploys