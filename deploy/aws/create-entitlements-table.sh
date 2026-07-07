#!/usr/bin/env bash
# create-entitlements-table.sh — one-time DynamoDB table for per-user service entitlements.
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
TABLE="${ENTITLEMENTS_TABLE:-eduardoos_entitlements}"

if aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" >/dev/null 2>&1; then
  echo "Table $TABLE already exists in $REGION"
  exit 0
fi

aws dynamodb create-table \
  --table-name "$TABLE" \
  --attribute-definitions \
    AttributeName=userEmail,AttributeType=S \
    AttributeName=serviceId,AttributeType=S \
  --key-schema \
    AttributeName=userEmail,KeyType=HASH \
    AttributeName=serviceId,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region "$REGION"

echo "Created table $TABLE in $REGION"
