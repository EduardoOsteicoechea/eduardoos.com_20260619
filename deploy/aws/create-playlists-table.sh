#!/usr/bin/env bash
# create-playlists-table.sh — one-time DynamoDB table for worship playlists.
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
TABLE="${PLAYLISTS_TABLE:-eduardoos_playlists}"

if aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" >/dev/null 2>&1; then
  echo "Table $TABLE already exists in $REGION"
  exit 0
fi

aws dynamodb create-table \
  --table-name "$TABLE" \
  --attribute-definitions \
    AttributeName=userId,AttributeType=S \
    AttributeName=playlistId,AttributeType=S \
  --key-schema \
    AttributeName=userId,KeyType=HASH \
    AttributeName=playlistId,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region "$REGION"

echo "Created table $TABLE in $REGION"
