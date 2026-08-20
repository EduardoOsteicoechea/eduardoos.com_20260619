# Eduardo OS

Production tree at the repo root: Astro frontend, unified Go backend (`eduardoos.nex`), nginx edge, and EC2 deploy scripts.

## Architecture

| Layer | Technology | Role |
|-------|-----------|------|
| Edge | Nginx + Certbot | HTTPS termination, static Astro site, `/api/*` proxy |
| Backend | Go `backend/` (`cmd/server`) | Auth, content APIs, payments, church, homescool, DynamoDB/S3 |
| Frontend | Astro + React in `frontend/` | Plain CSS, auth UI, pamphlet, articles, church, homescool, music |

## Directory Tree

```
frontend/                  Astro + React client (dist → nginx html)
backend/                   Go module eduardoos.nex (bin/eduardoos-next)
backend/revitapi/          APS / Revit Design Automation AppBundle
deploy/ec2/                Remote deploy + publish-frontend-dist (+ optional build-frontend recovery)
deploy/aws/                IAM / DynamoDB bootstrap helpers
nginx/                     Reverse proxy config + TLS certs
.github/workflows/         Production deploy (selective scopes)
specs/                     Feature specs
```

## Prerequisites

- Docker Desktop or Docker Engine + Compose v2 (nginx + certbot only)
- OpenSSL (for local TLS certificates)
- Node.js 20+ (frontend)
- Go 1.23+ (backend)

## Local Run

```bash
# 1. Configure secrets
cp .env.example .env
# Edit .env — set JWT_SECRET, INTERNAL_SERVICE_SECRET, SMTP_PASS, ADDR=:3000

# 2. Backend
cd backend && go run ./cmd/server

# 3. Frontend (separate terminal)
cd frontend && npm ci && npm run dev

# 4. Optional: nginx + certbot edge
mkdir -p nginx/certs/live/localhost
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/certs/live/localhost/privkey.pem \
  -out nginx/certs/live/localhost/fullchain.pem \
  -subj "/CN=localhost"
# Build frontend/dist first, then:
docker compose up -d
# https://localhost  (accept self-signed cert warning)
```

## EC2 Deploy (ARM64 / Graviton)

Pushes to `master` deploy via [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml):

- Selective scopes: `backend/*`, `frontend/*`, `nginx/*` + compose, `deploy/*`
- **Frontend:** Astro builds on the GitHub Actions runner; CI uploads `frontend-dist.tgz` and EC2 runs `deploy/ec2/publish-frontend-dist.sh` (rsync into `frontend/dist` — no `npm`/`astro` on the server)
- Remote: `deploy/ec2/deploy-remote.sh` → `deploy-remote-production.sh`
- Production `.env` at `APP_DIR/.env` (`ADDR=:3000`)
- systemd: `WorkingDirectory=$APP_DIR`, `ExecStart=$APP_DIR/backend/bin/eduardoos-next`
- Static: `./frontend/dist` → `/usr/share/nginx/html`
- Manual recovery on EC2 only: `bash deploy/ec2/build-frontend.sh`
- Spec / agent gate: [`specs/005-frontend-gha-dist/spec.md`](specs/005-frontend-gha-dist/spec.md) — compile frontend locally before push when `frontend/**` changed
- Full Amazon Linux bootstrap runbook: [`deploy/ec2/AMAZON-LINUX-SETUP.md`](deploy/ec2/AMAZON-LINUX-SETUP.md)

Staging (`:8080` / `:3001`) was removed in the flatten cutover.

IAM policy template: [`deploy/aws/ec2-iam-policy.json`](deploy/aws/ec2-iam-policy.json). Secrets: `npm run secrets:generate` — see [`deploy/aws/README.md`](deploy/aws/README.md).

## Public API Endpoints (via Nginx → Backend)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | Public | Register + send OTP |
| POST | `/api/auth/login` | Public | Login (verified users) |
| POST | `/api/auth/verify-otp` | Public | Verify email OTP |
| POST | `/api/auth/forgot-password` | Public | Email a password-reset code |
| POST | `/api/auth/reset-password` | Public | Set a new password with email + OTP |
| POST | `/api/logger` | Public | Flight log ingestion |
| POST | `/api/tester` | Public | QA engine |
| POST | `/api/payments/intents` | Public | Create PayPal payment intent |
| GET | `/api/payments/status/:id` | Public | Poll payment intent status |
| POST | `/api/payments/webhook/paypal` | Public | PayPal IPN webhook |
| GET | `/api/media/skills/:skillId` | Public | Skill portfolio media |
| POST | `/api/profile/ask` | Public + humanToken | Site AI dock (home + contact) |
| POST | `/api/contact/ask` | Public + humanToken | Legacy contact ask (still routed) |
| GET | `/api/articles` | Public | Pamphlet articles index |
| GET | `/api/media/audio` | Public | Worship audio library |
| GET | `/health` | Public | Backend health |

## Frontend Pages

| Page | Path |
|------|------|
| Home | `/` |
| Register / Login / OTP / Reset | `/auth/*` |
| Flight Logger / QA Tester | `/observability/*` |
| Subscription | `/payments/subscription` |
| Pamphlet editor | `/documents/pamphlet` (print POSTs `header_layout` + `footer_layout` mm from CSS to PDF; header includes subtitle row under title) |
| Articles | `/articulos`, `/articulos/ver?id=` |
| Homescool | `/homescool` |
| Church | `/church` |
| Music | `/media/musica` |
| Contact | `/contact` (same docked AI agent as home + Email/WhatsApp) |

## Development Tests

```bash
cd backend && go test ./...
cd frontend && npm test
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ADDR` / `PORT` | Backend listen (`:3000` in production) |
| `JWT_SECRET` | JWT signing key |
| `INTERNAL_SERVICE_SECRET` | HMAC secret for internal tokens |
| `SMTP_USER` / `SMTP_PASS` | Gmail OTP delivery |
| `DOMAIN` / `CERTBOT_EMAIL` | Production TLS |
| `AWS_REGION` / `S3_*` / `*_BACKEND` / `*_TABLE` | AWS data plane |
| `DEEPSEEK_*` | Chat / debate models |
| `APS_*` | Autodesk Platform Services |

## CI/CD

- `deploy.yml` — selective EC2 production deploy on `master`
