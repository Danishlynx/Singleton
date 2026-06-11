#!/usr/bin/env bash
# Provision a single-region Aurora DSQL cluster and print the connection endpoint.
# Prereqs: AWS CLI v2 configured (aws configure). Requires `jq` for JSON parsing.
#   Usage: ./single-region.sh [region] [name]
set -euo pipefail

REGION="${1:-us-east-1}"
NAME="${2:-singleton}"

command -v aws >/dev/null || { echo "AWS CLI v2 required (https://aws.amazon.com/cli/)"; exit 1; }
command -v jq  >/dev/null || { echo "jq required for JSON parsing"; exit 1; }

echo "==> Identity:"
aws sts get-caller-identity --output table

echo "==> Creating DSQL cluster in $REGION ..."
CREATE=$(aws dsql create-cluster \
  --region "$REGION" \
  --no-deletion-protection-enabled \
  --tags "Name=$NAME,project=singleton" \
  --output json)
ID=$(echo "$CREATE" | jq -r '.identifier')
ARN=$(echo "$CREATE" | jq -r '.arn')
echo "    identifier = $ID"
echo "    arn        = $ARN"

echo "==> Waiting for ACTIVE ..."
while true; do
  sleep 5
  STATUS=$(aws dsql get-cluster --region "$REGION" --identifier "$ID" --output json | jq -r '.status')
  echo "    status = $STATUS"
  [ "$STATUS" = "ACTIVE" ] && break
done

ENDPOINT="$ID.dsql.$REGION.on.aws"
echo ""
echo "==> Cluster ACTIVE. Endpoint: $ENDPOINT"
echo "Add to .env.local:"
echo "    AWS_REGION=$REGION"
echo "    DSQL_CLUSTER_ENDPOINT=$ENDPOINT"
echo "    CLUSTER_USER=admin"
echo "Cluster ARN (for iam-policy.json): $ARN"
