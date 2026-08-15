#!/usr/bin/env bash
# create-ifcbim-table.sh — one-time DynamoDB table linking users to IFC models in S3 ifcbim/.
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
TABLE="${IFCBIM_TABLE:-eduardoos_ifcbim}"

if aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" >/dev/null 2>&1; then
  echo "Table $TABLE already exists in $REGION"
  exit 0
fi

aws dynamodb create-table \
  --table-name "$TABLE" \
  --attribute-definitions \
    AttributeName=userId,AttributeType=S \
    AttributeName=modelId,AttributeType=S \
  --key-schema \
    AttributeName=userId,KeyType=HASH \
    AttributeName=modelId,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region "$REGION"

echo "Created table $TABLE in $REGION"
