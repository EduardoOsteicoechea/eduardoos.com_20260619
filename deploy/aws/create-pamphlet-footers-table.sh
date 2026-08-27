#!/usr/bin/env bash
# create-pamphlet-footers-table.sh — reusable static pamphlet footer profiles.
#
# Uses eduardoos_static_pamphlet_footers (PK userId, SK footerId).
# Legacy eduardoos_pamphlet_footers (SK pamphletId) is a different table — leave it alone.
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
TABLE="${FOOTERS_TABLE:-eduardoos_static_pamphlet_footers}"

if aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" >/dev/null 2>&1; then
  echo "Table $TABLE already exists in $REGION"
  exit 0
fi

aws dynamodb create-table \
  --table-name "$TABLE" \
  --attribute-definitions \
    AttributeName=userId,AttributeType=S \
    AttributeName=footerId,AttributeType=S \
  --key-schema \
    AttributeName=userId,KeyType=HASH \
    AttributeName=footerId,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region "$REGION"

echo "Created table $TABLE in $REGION"
