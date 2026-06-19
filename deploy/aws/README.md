# AWS deployment — EC2 ARM64 + IAM permissions

This stack runs on **Graviton (arm64)** EC2 instances in **us-east-1** and uses:

| Resource | Name | Purpose |
|----------|------|---------|
| S3 bucket | `eduardoos20260607` | Media uploads under `media/` |
| DynamoDB | `eduardoos_catalog` | Generic app KV (payments, catalog) |
| DynamoDB | `eduardoos_users` | Keys prefixed `user:` |
| DynamoDB | `eduardoos_posts` | Keys prefixed `post:` |
| DynamoDB | `eduardoos_refresh_tokens` | Keys prefixed `refresh:` |

## 1. Create the IAM policy

In **IAM → Policies → Create policy → JSON**, paste the contents of
[`ec2-iam-policy.json`](./ec2-iam-policy.json), then name it e.g.
`EduardoOS-EC2-S3-DynamoDB`.

## 2. Attach policy to the EC2 instance role

1. **IAM → Roles** → select (or create) the role attached to your EC2 instance
   (e.g. `eduardoos-ec2-role`).
2. **Add permissions → Attach policies** → select `EduardoOS-EC2-S3-DynamoDB`.
3. Ensure the EC2 instance uses this role (**Actions → Security → Modify IAM role**).

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
- Sets `DATABASE_BACKEND=dynamodb` and `S3_BACKEND=aws`

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
| `SMTP_USER` | Gmail address |
| `SMTP_PASS` | Gmail app password |
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
