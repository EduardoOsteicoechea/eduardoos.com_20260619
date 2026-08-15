# Eduardo OS Next — staging deploy (next-only)

These scripts deploy **Eduardo OS Next** as a **secondary** stack. They never replace production.

## Staging URL

After a successful staging deploy:

```text
http://<EC2_IP>:8080/
http://<EC2_IP>:8080/health
```

Replace `<EC2_IP>` with the value of GitHub secret `EC2_HOST` (or your instance public IP). Production remains on HTTPS `:443` / API `:3000`.

Open **Security Group TCP 8080** inbound for staging access.

CI smoke treats **on-box** `127.0.0.1:8080` as the required check. Public `http://$EC2_HOST:8080` returning `000` almost always means the SG (or host firewall) still blocks TCP 8080 — not a bad nginx root. Production `:443` / `default.conf` stays untouched.

## Isolation rules

- Live under `eduardoos-next/deploy/` only (plus a non-destructive nginx include).
- Do **not** edit parent `deploy/ec2/deploy-remote.sh`, `.github/workflows/deploy.yml`, or overwrite `nginx/default.conf`.
- Production keeps serving the current app on its existing ports until an explicit cutover (`CUTOVER.md` / T099).

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

### Auth email troubleshooting

On the EC2 host:

```bash
journalctl -u eduardoos-next -b | grep -E 'smtp:|sendResetOTP|SMTP_PASS empty'
```

Look for `pass_set=true` at boot and `auth smtp sendResetOTP ok` / `failed` after a reset request. UI trace IDs (`eosn-…`) are preserved when the client sends `X-Correlation-ID` (staging nginx no longer overwrites with `$request_id`).

If logs show `535 5.7.8 Username and Password not accepted`, regenerate a Gmail **App Password** for `SMTP_USER`, set GitHub secret `SMTP_PASS` to the **16 characters with no spaces**, then re-run `deploy-next-staging`.

## Scripts

| Script | Purpose |
|--------|---------|
| `deploy-remote-staging.sh` | Full EC2 staging deploy (build, systemd, nginx :8080) |
| `build-frontend.sh` | `npm ci` + `npm run build` with `NODE_OPTIONS=--max-old-space-size=4096` |
| `run-backend.sh` | Loads `.env`, builds `backend/bin/eduardoos-next` if needed, listens on `ADDR` / `PORT` (default `:3001`) |
| `eduardoos-next-backend.service` | systemd unit template → installed as `eduardoos-next.service` |
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
- [ ] Confirm production HTTPS site and parent `nginx/default.conf` unchanged