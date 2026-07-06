#!/usr/bin/env bash
# ensure-ec2-iam-policy.sh — Create/update IAM policy and attach to the EC2 instance role.
#
# Fixes gallery errors like:
#   AccessDenied: ... is not authorized to perform: s3:ListBucket on resource: arn:aws:s3:::eduardoos20260607
#
# Run from your laptop (AWS CLI configured) or CloudShell:
#   bash deploy/aws/ensure-ec2-iam-policy.sh
#
# Override defaults:
#   IAM_POLICY_NAME=EduardoOS-EC2-S3-DynamoDB IAM_ROLE_NAME=eduardoos-ec2-s3-role bash deploy/aws/ensure-ec2-iam-policy.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POLICY_FILE="${SCRIPT_DIR}/ec2-iam-policy.json"
POLICY_NAME="${IAM_POLICY_NAME:-EduardoOS-EC2-S3-DynamoDB}"
ROLE_NAME="${IAM_ROLE_NAME:-eduardoos-ec2-s3-role}"
ACCOUNT_ID="${AWS_ACCOUNT_ID:-241533144630}"

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI is required" >&2
  exit 1
fi

POLICY_ARN="arn:aws:iam::${ACCOUNT_ID}:policy/${POLICY_NAME}"

echo "==> Ensuring IAM policy ${POLICY_NAME}"
if aws iam get-policy --policy-arn "${POLICY_ARN}" >/dev/null 2>&1; then
  VERSIONS=$(aws iam list-policy-versions --policy-arn "${POLICY_ARN}" --query 'Versions[?IsDefaultVersion==`false`].VersionId' --output text)
  for version in ${VERSIONS}; do
    aws iam delete-policy-version --policy-arn "${POLICY_ARN}" --version-id "${version}" || true
  done
  aws iam create-policy-version \
    --policy-arn "${POLICY_ARN}" \
    --policy-document "file://${POLICY_FILE}" \
    --set-as-default
  echo "    Updated policy document"
else
  aws iam create-policy \
    --policy-name "${POLICY_NAME}" \
    --policy-document "file://${POLICY_FILE}" \
    --description "S3 media bucket + DynamoDB tables for Eduardo OS EC2"
  echo "    Created policy"
fi

echo "==> Attaching policy to role ${ROLE_NAME}"
if ! aws iam get-role --role-name "${ROLE_NAME}" >/dev/null 2>&1; then
  echo "ERROR: IAM role ${ROLE_NAME} not found. Create it or set IAM_ROLE_NAME." >&2
  exit 1
fi

aws iam attach-role-policy --role-name "${ROLE_NAME}" --policy-arn "${POLICY_ARN}" 2>/dev/null || true
echo "    Attached ${POLICY_ARN}"

echo "==> Done. If the EC2 instance was already running, wait ~1 minute for credentials to refresh, then reload /media/gallery"
