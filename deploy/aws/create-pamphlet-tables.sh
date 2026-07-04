#!/usr/bin/env bash
# create-pamphlet-tables.sh — one-time DynamoDB tables for pamphlet drafts.
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"

create_table() {
  local table="$1"
  local hash_key="$2"
  local range_key="$3"

  if aws dynamodb describe-table --table-name "$table" --region "$REGION" >/dev/null 2>&1; then
    echo "Table $table already exists in $REGION"
    return 0
  fi

  aws dynamodb create-table \
    --table-name "$table" \
    --attribute-definitions \
      AttributeName="$hash_key",AttributeType=S \
      AttributeName="$range_key",AttributeType=S \
    --key-schema \
      AttributeName="$hash_key",KeyType=HASH \
      AttributeName="$range_key",KeyType=RANGE \
    --billing-mode PAY_PER_REQUEST \
    --region "$REGION"

  echo "Created table $table in $REGION"
}

create_table "${PAMPHLET_HEADERS_TABLE:-eduardoos_pamphlet_headers}" userId pamphletId
create_table "${PAMPHLET_FOOTERS_TABLE:-eduardoos_pamphlet_footers}" userId pamphletId
create_table "${PAMPHLET_CONTENTS_TABLE:-eduardoos_pamphlet_contents}" userId pamphletId
create_table "${PAMPHLET_REGISTRY_TABLE:-eduardoos_pamphlet_registry}" userId pamphletId
