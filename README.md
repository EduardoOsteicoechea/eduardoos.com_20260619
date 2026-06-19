# Eduardo OS — Zero Trust Microservices Platform

Fully decoupled, multi-container architecture orchestrated via Docker Compose. The stack runs on Docker Desktop (local) and AWS EC2 with a single `docker compose up -d` command.

## Architecture

| Layer | Technology | Role |
|-------|-----------|------|
| Edge | Nginx + Certbot | HTTPS termination, static Astro site, `/api/*` proxy |
| Gateway | Rust/Axum `backend` | Correlation IDs, internal token signing, auth exemptions |
| Services | 7 Rust microservices | Authenticator, database, documents, telemetry, s3, chatbot, tester |
| Frontend | Astro + React | Plain CSS, flight-log telemetry, auth UI |

## Directory Tree

```
frontend/                  Astro + React client
backend/                   API gateway
microservices/
  authenticator/           OTP + SMTP + JWT
  database/                Key-value persistence
  documents/               Raw PDF generator (no external PDF crates)
  telemetry/               Flight log ingestion
  s3/                      Object storage proxy
  chatbot/                 Conversational routing
  tester/                  QA automation engine
nginx/                     Reverse proxy config + TLS certs
crates/common/             Shared token, telemetry, error types
.github/workflows/         9 path-scoped CI pipelines
```

## Prerequisites

- Docker Desktop or Docker Engine + Compose v2
- OpenSSL (for local TLS certificates)
- Node.js 22+ (frontend development only)
- Rust stable (backend development only)

## Local Run (Docker Compose)

```bash
# 1. Configure secrets
cp .env.example .env
# Edit .env — set JWT_SECRET, INTERNAL_SERVICE_SECRET, SMTP_PASS

# 2. Generate self-signed TLS for local HTTPS
mkdir -p nginx/certs/live/localhost
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/certs/live/localhost/privkey.pem \
  -out nginx/certs/live/localhost/fullchain.pem \
  -subj "/CN=localhost"

# 3. Build and start all services
docker compose up -d --build

# 4. Open the app
# https://localhost  (accept self-signed cert warning)
```

## EC2 Deploy (ARM64 / Graviton)

On an **arm64** EC2 instance with Docker and an IAM instance role (see
[`deploy/aws/README.md`](deploy/aws/README.md)):

```bash
cp .env.example .env
# Set DOMAIN, CERTBOT_EMAIL, secrets

docker compose -f docker-compose.yml -f docker-compose.ec2.yml up -d --build
```

The EC2 overlay enables `linux/arm64` builds and switches to real **DynamoDB**
and **S3** backends. Local Docker Desktop keeps in-memory DB + stub S3.

IAM policy template: [`deploy/aws/ec2-iam-policy.json`](deploy/aws/ec2-iam-policy.json)

## Public API Endpoints (via Nginx → Gateway)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | Public | Register + send OTP |
| POST | `/api/auth/login` | Public | Login (verified users) |
| POST | `/api/auth/verify-otp` | Public | Verify email OTP |
| POST | `/api/logger` | Public | Flight log ingestion proxy |
| POST | `/api/tester` | Public | QA engine proxy |
| POST | `/api/payments/intents` | Public | Create PayPal payment intent (verified user) |
| GET | `/api/payments/status/:id` | Public | Poll payment intent status |
| POST | `/api/payments/webhook/paypal` | Public | PayPal IPN webhook |
| GET | `/api/logger/logs` | Public | Filtered flight logs |
| GET | `/api/logger/analytics` | Public | Log aggregates |
| GET | `/api/logger/trace/:id` | Public | Distributed trace |
| GET | `/api/tester/runs` | Public | QA run history |
| GET | `/api/tester/runs/:run_id` | Public | Single QA run detail |

## Frontend Pages

| Page | Path |
|------|------|
| Home | `/` |
| Register | `/auth/register` |
| Login | `/auth/login` |
| Verify OTP | `/auth/verify-otp` |
| Flight Logger UI | `/observability/logger` |
| QA Tester UI | `/observability/tester` |
| Monthly Basic Subscription | `/payments/subscription/montly/basic` |

## Development Tests

```bash
# Frontend (Vitest)
cd frontend && npm test

# Rust workspace
cargo test --workspace
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | JWT signing key for authenticator |
| `INTERNAL_SERVICE_SECRET` | HMAC secret for `X-Internal-Token` |
| `SMTP_USER` | Gmail address (`eduardooost@gmail.com`) |
| `SMTP_PASS` | Gmail app password for OTP delivery |
| `DOMAIN` | Production domain for Certbot |
| `CERTBOT_EMAIL` | Let's Encrypt contact email |
| `AWS_REGION` | AWS region (`us-east-1`) |
| `S3_BUCKET` | S3 bucket (`eduardoos20260607`) |
| `S3_PREFIX` | Object prefix (`media`) |
| `S3_BACKEND` | `stub` (local) or `aws` (EC2) |
| `DATABASE_BACKEND` | `memory` (local) or `dynamodb` (EC2) |
| `DYNAMODB_TABLE_PREFIX` | Table prefix (`eduardoos`) |

## CI/CD

Nine independent GitHub Actions workflows monitor path-scoped changes:

- `frontend.yml`, `backend.yml`, `authenticator.yml`, `database.yml`
- `documents.yml`, `telemetry.yml`, `tester.yml`, `s3.yml`, `chatbot.yml`

## Test Outcomes (Latest)

- Frontend: Vitest — 23 tests (telemetry, API, auth, validation, observability, payments)
- Rust: `cargo test --workspace` — common token/PDF/flight-log unit tests per service

## GitHub Repository

Create the remote repository (GitHub CLI required):

```bash
gh repo create eduardoos.com_20260619 --public --source=. --remote=origin --push
```
