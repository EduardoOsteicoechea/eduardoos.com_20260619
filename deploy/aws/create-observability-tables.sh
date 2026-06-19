#!/usr/bin/env bash
# Create DynamoDB observability tables with 7-day TTL (run once per AWS account/region).
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
PREFIX="${DYNAMODB_TABLE_PREFIX:-eduardoos}"
LOGS_TABLE="${PREFIX}_flight_logs"
RUNS_TABLE="${PREFIX}_test_runs"

echo "==> Creating ${LOGS_TABLE} (TTL: expiresAt, 7-day retention)"
aws dynamodb create-table \
  --region "${REGION}" \
  --table-name "${LOGS_TABLE}" \
  --billing-mode PAY_PER_REQUEST \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=SK,AttributeType=S \
    AttributeName=correlationId,AttributeType=S \
    AttributeName=timestamp,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
    AttributeName=SK,KeyType=RANGE \
  --global-secondary-indexes \
    "IndexName=correlation-index,KeySchema=[{AttributeName=correlationId,KeyType=HASH},{AttributeName=timestamp,KeyType=RANGE}],Projection={ProjectionType=ALL}" \
  2>/dev/null || echo "    (table may already exist)"

aws dynamodb update-time-to-live \
  --region "${REGION}" \
  --table-name "${LOGS_TABLE}" \
  --time-to-live-specification "Enabled=true,AttributeName=expiresAt" \
  2>/dev/null || true

echo "==> Creating ${RUNS_TABLE} (TTL: expiresAt, 7-day retention)"
aws dynamodb create-table \
  --region "${REGION}" \
  --table-name "${RUNS_TABLE}" \
  --billing-mode PAY_PER_REQUEST \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=SK,AttributeType=S \
    AttributeName=runId,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
    AttributeName=SK,KeyType=RANGE \
  --global-secondary-indexes \
    "IndexName=runId-index,KeySchema=[{AttributeName=runId,KeyType=HASH}],Projection={ProjectionType=ALL}" \
  2>/dev/null || echo "    (table may already exist)"

aws dynamodb update-time-to-live \
  --region "${REGION}" \
  --table-name "${RUNS_TABLE}" \
  --time-to-live-specification "Enabled=true,AttributeName=expiresAt" \
  2>/dev/null || true

echo "==> Observability tables ready"
