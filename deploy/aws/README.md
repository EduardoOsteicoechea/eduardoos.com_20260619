# AWS deployment — EC2 ARM64 + IAM permissions

This stack runs on **Graviton (arm64)** EC2 instances in **us-east-1** and uses:

| Resource | Name | Purpose |
|----------|------|---------|
| S3 bucket | `eduardoos20260607` | Media under `media/`; IFC models under **prefix** `ifcbim/` (not a separate bucket) |
| DynamoDB | `eduardoos_catalog` | Generic app KV (payments, catalog) |
| DynamoDB | `eduardoos_users` | Keys prefixed `user:` |
| DynamoDB | `eduardoos_posts` | Keys prefixed `post:` |
| DynamoDB | `eduardoos_refresh_tokens` | Keys prefixed `refresh:` |
| DynamoDB | `eduardoos_flight_logs` | Flight logs (7-day TTL on `expiresAt`) |
| DynamoDB | `eduardoos_test_runs` | QA + build test runs (7-day TTL) |
| DynamoDB | `eduardoos_playlists` | Worship playlists (PK `userId`, SK `playlistId`) |
| DynamoDB | `eduardoos_epams` | Cloud .epam pamphlets metadata (PK `userId`, SK `epamId`; body in S3 `media/epams/`) |
| DynamoDB | `eduardoos_pamphlet_footers` | Legacy pamphlet footer rows (PK `userId`, SK `pamphletId`) — not used by static profiles |
| DynamoDB | `eduardoos_pamphlet_footer_profiles` | Reusable static pamphlet footer profiles (PK `userId`, SK `footerId`) |
| DynamoDB | `eduardoos_edebats` | Cloud .edebat debate metadata (PK `userId`, SK `debateId`; body in S3 `media/edebats/`) |
| DynamoDB | `eduardoos_payments` | PayPal intents and completed payments (PK `intentId`, GSI `userEmail` + `createdAt`) |
| DynamoDB | `eduardoos_entitlements` | Active service access per user (PK `userEmail`, SK `serviceId`) |
| DynamoDB | `eduardoos_ifcbim` | IFC models per user (PK `userId`, SK `modelId`; body in S3 `ifcbim/`) |

## Observability tables (flight logs + test runs)

Telemetry and tester use **separate DynamoDB tables** on EC2 (not the generic
`database` service KV). Each row includes `expiresAt` (Unix epoch seconds);
DynamoDB TTL deletes items automatically after **7 days**.

| Table | PK | SK | GSI | TTL attribute |
|-------|----|----|-----|---------------|
| `eduardoos_flight_logs` | `LOG` | `{millis}#{uuid}` | `correlation-index` (correlationId + timestamp) | `expiresAt` |
| `eduardoos_test_runs` | `RUN` | `{millis}#{runId}` | `runId-index` | `expiresAt` |

**Create once** (from a machine with AWS CLI + permissions):

```bash
bash deploy/aws/create-observability-tables.sh
bash deploy/aws/create-playlists-table.sh
bash deploy/aws/create-epams-table.sh
bash deploy/aws/create-pamphlet-footers-table.sh
bash deploy/aws/create-edebats-table.sh
bash deploy/aws/ensure-ec2-iam-policy.sh
bash deploy/aws/create-payments-table.sh
bash deploy/aws/create-entitlements-table.sh
bash deploy/aws/create-ifcbim-table.sh
bash deploy/aws/create-ifcbim-prefix.sh
```

**Do not create an S3 bucket named `ifcbim`.** IFC files live as keys
`ifcbim/{user}/{modelId}.ifc` inside **`eduardoos20260607`**. The DynamoDB table
you need is **`eduardoos_ifcbim`** (console: DynamoDB → Tables, not S3).

Deploy on EC2 also runs this script when the instance role includes
`CreateTable` / `UpdateTimeToLive` (see [`ec2-iam-policy.json`](./ec2-iam-policy.json)).

Local Docker keeps in-memory stores (`TELEMETRY_BACKEND=memory`,
`TESTER_BACKEND=memory`).


Production uses **two inline policies** on role **`eduardoos-ec2-s3-role`**:

| Policy file | Covers |
|-------------|--------|
| [`ec2-iam-s3-policy.json`](./ec2-iam-s3-policy.json) | `ListBucket` (`media/`, `ifcbim/`, `homeschool/`, `greek/`, `church/`, `scrib/`, `ereport/`) + object access on those prefixes |
| [`ec2-iam-dynamodb-policy.json`](./ec2-iam-dynamodb-policy.json) | All Eduardo OS DynamoDB tables |

App objects live under **`media/`** (gallery, avatars, audio), **`ifcbim/`** (IFC models), **`homeschool/`** (Homescool spaces), **`greek/`**, **`church/`**, **`scrib/`**, and **`ereport/`**:

| Path | Feature |
|------|---------|
| `media/` | Gallery images |
| `media/profiles/` | Profile avatars |
| `media/worship_playlists/` | Playlist audio |
| `ifcbim/{user}/{modelId}.ifc` | Signed-in BIM models |
| `homeschool/{teacher}/{student}/…` | Homescool learning objects |
| `greek/{user}/{group}/chapters/…/letters/{i}.svg` | Greek letter-by-letter books |
| `church/…` | Church registry objects |
| `scrib/{user}/…` | Scrib books/sheets |
| `ereport/{user}/…` | eReport Issue Tracker `.ereport` files |

Your S3 policy shape is correct. Add **`media/`** alongside **`media/*`** in the `s3:prefix` condition (see `ec2-iam-s3-policy.json`) so `ListObjects` with prefix `media/` is allowed.

Optional combined policy: [`ec2-iam-policy.json`](./ec2-iam-policy.json) (broader, single file).

### Troubleshooting: `AccessDenied`

| Error | Cause | Fix |
|-------|-------|-----|
| `s3:ListBucket` | App listed the whole bucket (`prefix=""`) | Fixed in code — lists `media/` only. Redeploy latest. |
| `s3:PutObject` on `profiles/...` | Old build stored outside `media/` | Redeploy — now uses `media/profiles/`. |
| `s3:PutObject` on `ereport/...` → API `could not save meta` | Inline S3 policy missing `ereport/*` (and `scrib/*`) | Update [`ec2-iam-s3-policy.json`](./ec2-iam-s3-policy.json) on role `eduardoos-ec2-s3-role`, wait ~1 min, retry. |

After updating IAM or deploying code, wait ~1 minute for instance credentials to refresh.

No `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` are required in `.env` when
using an instance profile — the AWS SDK inside containers reads credentials from
the EC2 metadata service.

## 3. Launch / use an ARM64 instance

- AMI: Amazon Linux 2023 or Ubuntu 22.04 **arm64**
- Instance type: e.g. `t4g.small` or larger
- Install Docker Engine + Compose v2
- Open ports **80** and **443** in the security group

## 4. Deploy on EC2

```bash
git clone https://github.com/EduardoOsteicoechea/eduardoos.com_20260619.git
cd eduardoos.com_20260619
cp .env.example .env
# Edit JWT_SECRET, INTERNAL_SERVICE_SECRET, DOMAIN, CERTBOT_EMAIL, SMTP_PASS

docker compose -f docker-compose.yml -f docker-compose.ec2.yml up -d --build
```

The `docker-compose.ec2.yml` overlay:

- Sets `platform: linux/arm64` for every service (native on Graviton)
- Sets `DATABASE_BACKEND=dynamodb`, `TELEMETRY_BACKEND=dynamodb`, and `TESTER_BACKEND=dynamodb`
- Sets `S3_BACKEND=aws`

## 5. Local Docker (unchanged)

On Docker Desktop (amd64), use only the base file — memory DB + stub S3:

```bash
docker compose up -d --build
```

## 6. Optional environment overrides

| Variable | Local default | EC2 |
|----------|---------------|-----|
| `DATABASE_BACKEND` | `memory` | `dynamodb` (via ec2 overlay) |
| `S3_BACKEND` | `stub` | `aws` (via ec2 overlay) |
| `S3_BUCKET` | `eduardoos20260607` | same |
| `S3_PREFIX` | `media` | same |
| `AWS_REGION` | `us-east-1` | same |
| `DYNAMODB_TABLE_PREFIX` | `eduardoos` | same |
| `PLAYLISTS_BACKEND` | `memory` | `dynamodb` (via ec2 overlay) |
| `PLAYLISTS_TABLE` | `eduardoos_playlists` | same |
| `PAYMENTS_BACKEND` | `memory` | `dynamodb` |
| `PAYMENTS_TABLE` | `eduardoos_payments` | same |
| `ENTITLEMENTS_BACKEND` | `memory` | `dynamodb` |
| `ENTITLEMENTS_TABLE` | `eduardoos_entitlements` | same |
| `PAYPAL_BUSINESS_EMAIL` | empty | your PayPal seller email for variable checkout amounts |
| `PAYPAL_CHECKOUT_URL` | `https://www.paypal.com/cgi-bin/webscr` | `https://www.sandbox.paypal.com/cgi-bin/webscr` for sandbox tests |
| `S3_AUDIO_PREFIX` | `worship_playlists` | same |

## 7. Verify AWS access from EC2

```bash
# After stack is up
curl -s http://localhost:3000/health   # via docker exec into database container, or gateway proxy
docker compose exec database curl -s http://localhost:3000/health
# Expect: {"backend":"dynamodb",...}

docker compose exec s3 curl -s http://localhost:3000/health
# Expect: {"backend":"aws","bucket":"eduardoos20260607",...}
```

## DynamoDB item shape

Generic keys use single-table style within each table:

| Attribute | Value |
|-----------|-------|
| `PK` | `APP` |
| `SK` | full key (e.g. `payment:<uuid>`) |
| `data` | JSON string payload |

S3 objects are stored at `{S3_PREFIX}/{key}` (default `media/...`).
Worship playlist audio lives under `media/worship_playlists/`.

## 8. Generate application secrets (npm)

From the repository root:

```bash
npm run secrets:generate
```

This prints `JWT_SECRET` and `INTERNAL_SERVICE_SECRET` — add them to **GitHub → Settings → Secrets and variables → Actions** and to your local `.env`.

## 9. GitHub Actions CI/CD (deploy to EC2)

Workflow: [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)

On every push to `master`:

1. Runs `go test ./...` and frontend tests/build
2. SSHs into EC2 using your configured secrets
3. Uploads `.env` built from GitHub secrets
4. Runs `deploy/ec2/deploy-remote.sh` (git pull + `docker compose` arm64)

### Required GitHub repository secrets

| Secret | Description |
|--------|-------------|
| `EC2_HOST` | Public IP for SSH (e.g. `52.55.235.150`) — **not** the TLS domain |
| `EC2_USER` | SSH user (`ubuntu` or `ec2-user`) |
| `EC2_SSH_PRIVATE_KEY` | Full private key (PEM), including `-----BEGIN...` lines |
| `JWT_SECRET` | From `npm run secrets:generate` |
| `INTERNAL_SERVICE_SECRET` | From `npm run secrets:generate` |
| `SMTP_USER` | Gmail address that owns the App Password (e.g. `eduardooost@gmail.com`) |
| `SMTP_PASS` | Gmail **App Password** — exactly 16 chars, no spaces (exact secret name; redeploy after change) |
| `DOMAIN` | **Hostname only** (e.g. `eduardoos.com`) — DNS A record → EC2 IP; used for TLS |
| `CERTBOT_EMAIL` | Let's Encrypt contact email |

Optional: `PAYPAL_HOSTED_BUTTON_ID`, `PAYPAL_IPN_VERIFY_URL`

### EC2 host prerequisites (one-time)

```bash
# Docker + Compose v2
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git openssl
sudo usermod -aG docker $USER
# log out and back in

# IAM instance role attached (S3 + DynamoDB) — see section 2
```

### Manual deploy (without CI)

```bash
scp .env user@ec2:~/eduardoos.com_20260619/.env
ssh user@ec2 'APP_DIR=~/eduardoos.com_20260619 bash -s' < deploy/ec2/deploy-remote.sh
```
