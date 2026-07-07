#!/usr/bin/env bash
# create-payments-table.sh — one-time DynamoDB table for PayPal payment records.
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
TABLE="${PAYMENTS_TABLE:-eduardoos_payments}"

if aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" >/dev/null 2>&1; then
  echo "Table $TABLE already exists in $REGION"
  exit 0
fi

aws dynamodb create-table \
  --table-name "$TABLE" \
  --attribute-definitions \
    AttributeName=intentId,AttributeType=S \
    AttributeName=userEmail,AttributeType=S \
    AttributeName=createdAt,AttributeType=S \
  --key-schema \
    AttributeName=intentId,KeyType=HASH \
  --global-secondary-indexes \
    "IndexName=userEmail-createdAt-index,KeySchema=[{AttributeName=userEmail,KeyType=HASH},{AttributeName=createdAt,KeyType=RANGE}],Projection={ProjectionType=ALL}" \
  --billing-mode PAY_PER_REQUEST \
  --region "$REGION"

echo "Created table $TABLE in $REGION"
