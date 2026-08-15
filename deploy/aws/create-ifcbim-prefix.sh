#!/usr/bin/env bash
# create-ifcbim-prefix.sh — S3 has no real folders; this writes a marker so prefix ifcbim/ exists.
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
BUCKET="${S3_BUCKET:-eduardoos20260607}"
KEY="ifcbim/.keep"

if aws s3api head-object --bucket "$BUCKET" --key "$KEY" --region "$REGION" >/dev/null 2>&1; then
  echo "s3://$BUCKET/$KEY already exists"
  exit 0
fi

aws s3api put-object \
  --bucket "$BUCKET" \
  --key "$KEY" \
  --content-type "application/x-empty" \
  --region "$REGION" </dev/null

echo "Created s3://$BUCKET/$KEY (prefix ifcbim/)"
