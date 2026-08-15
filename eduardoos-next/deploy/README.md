# Eduardo OS Next — staging deploy (next-only)

These scripts deploy **Eduardo OS Next** as a **secondary** stack. They never replace production.

## Isolation rules

- Live under `eduardoos-next/deploy/` only.
- Do **not** edit parent `deploy/ec2/deploy-remote.sh`, `.github/workflows/deploy.yml`, or `nginx/default.conf`.
- Production keeps serving the current app on its existing ports until an explicit cutover (`CUTOVER.md` / T099).

## Typical layouts

1. **Same EC2, secondary ports** — Next API on `:3001`, static frontend from a separate root or `:4322`/nginx vhost; production stays on `:3000` / existing vhost.
2. **Separate host** — point DNS for a staging hostname at another instance; still use these scripts only.

## Scripts

| Script | Purpose |
|--------|---------|
| `build-frontend.sh` | `npm ci` + `npm run build` with `NODE_OPTIONS=--max-old-space-size=4096` |
| `run-backend.sh` | Loads `.env`, builds `backend/bin/eduardoos-next` if needed, listens on `ADDR` / `PORT` (default `:3001`) |
| `eduardoos-next-backend.service` | Optional systemd unit template for the Next binary |
| `smoke.sh` | `curl` `/health` (+ home if `SMOKE_HOME=1`); requires `BASE_URL` |

## Quick start (EC2 secondary)

```bash
cd /opt/eduardoos-next   # or your clone path to eduardoos-next
cp .env.example .env     # set JWT_SECRET, SMTP_*, etc.
./deploy/build-frontend.sh
./deploy/run-backend.sh  # foreground; or install the systemd unit
BASE_URL=http://127.0.0.1:3001 ./deploy/smoke.sh
```

## Optional nginx snippet (comments only — do not apply to parent default.conf)

```nginx
# OPTIONAL staging vhost example — keep in staging config only.
# server {
#   listen 443 ssl http2;
#   server_name staging.eduardoos.com;
#   # ssl_certificate ...;
#   # ssl_certificate_key ...;
#
#   root /opt/eduardoos-next/frontend/dist;
#   location / {
#     try_files $uri $uri/ /index.html;
#   }
#   location /api/ {
#     proxy_pass http://127.0.0.1:3001;
#     proxy_set_header Host $host;
#     proxy_set_header X-Correlation-ID $request_id;
#   }
#   location /health {
#     proxy_pass http://127.0.0.1:3001/health;
#   }
# }
```

## Smoke checklist (T051)

- [ ] Backend process up on `:3001` (or staging `PORT`)
- [ ] `BASE_URL=... ./deploy/smoke.sh` → `/health` OK
- [ ] Frontend `dist` served (direct or staging vhost)
- [ ] Register / login against Next API (SMTP or `DEV_RETURN_OTP=1` locally)
- [ ] Confirm production site and parent nginx unchanged