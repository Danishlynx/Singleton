#!/usr/bin/env bash
# Provision a multi-Region PEERED Aurora DSQL pair (two active endpoints, one logical DB).
# Prereqs: AWS CLI v2 configured; `jq`. Witness region must be US-based + DSQL-supported.
#   Usage: ./multi-region.sh [regionA] [regionB] [witness]
set -euo pipefail

REGION_A="${1:-us-east-1}"
REGION_B="${2:-us-east-2}"
WITNESS="${3:-us-west-2}"
NAME="singleton-mr"
MR_PROPS="{\"witnessRegion\":\"$WITNESS\"}"

command -v aws >/dev/null || { echo "AWS CLI v2 required"; exit 1; }
command -v jq  >/dev/null || { echo "jq required"; exit 1; }

wait_active() { # region id
  while true; do
    sleep 5
    local s; s=$(aws dsql get-cluster --region "$1" --identifier "$2" --output json | jq -r '.status')
    echo "    [$1/$2] status = $s"
    [ "$s" = "ACTIVE" ] && break
  done
}

echo "==> Creating cluster A in $REGION_A (witness $WITNESS) ..."
A=$(aws dsql create-cluster --region "$REGION_A" --no-deletion-protection-enabled \
  --multi-region-properties "$MR_PROPS" --tags "Name=$NAME-a,project=singleton" --output json)
A_ID=$(echo "$A" | jq -r '.identifier'); A_ARN=$(echo "$A" | jq -r '.arn')
echo "    A id=$A_ID arn=$A_ARN"

echo "==> Creating cluster B in $REGION_B (witness $WITNESS) ..."
B=$(aws dsql create-cluster --region "$REGION_B" --no-deletion-protection-enabled \
  --multi-region-properties "$MR_PROPS" --tags "Name=$NAME-b,project=singleton" --output json)
B_ID=$(echo "$B" | jq -r '.identifier'); B_ARN=$(echo "$B" | jq -r '.arn')
echo "    B id=$B_ID arn=$B_ARN"

echo "==> Peering A -> B ..."
aws dsql update-cluster --region "$REGION_A" --identifier "$A_ID" \
  --multi-region-properties "{\"witnessRegion\":\"$WITNESS\",\"clusters\":[\"$B_ARN\"]}" >/dev/null

echo "==> Peering B -> A ..."
aws dsql update-cluster --region "$REGION_B" --identifier "$B_ID" \
  --multi-region-properties "{\"witnessRegion\":\"$WITNESS\",\"clusters\":[\"$A_ARN\"]}" >/dev/null

echo "==> Waiting for both ACTIVE ..."
wait_active "$REGION_A" "$A_ID"
wait_active "$REGION_B" "$B_ID"

echo ""
echo "==> Peered pair ACTIVE."
echo "Add to .env.local:"
echo "    AWS_REGION=$REGION_A"
echo "    DSQL_CLUSTER_ENDPOINT=$A_ID.dsql.$REGION_A.on.aws"
echo "    AWS_REGION_SECONDARY=$REGION_B"
echo "    DSQL_CLUSTER_ENDPOINT_SECONDARY=$B_ID.dsql.$REGION_B.on.aws"
echo "    CLUSTER_USER=admin"
