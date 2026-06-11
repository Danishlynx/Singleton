#!/usr/bin/env bash
# Delete an Aurora DSQL cluster (cost cleanup → guarantees no further charges).
# Run with no id to LIST; with an id to DELETE. Multi-region: run once per region.
#   Usage: ./teardown.sh <region> [identifier]
set -euo pipefail

REGION="${1:-us-east-1}"
ID="${2:-}"

command -v aws >/dev/null || { echo "AWS CLI v2 required"; exit 1; }

if [ -z "$ID" ]; then
  echo "Clusters in $REGION:"
  aws dsql list-clusters --region "$REGION" --output table
  echo ""
  echo "Re-run with an identifier to delete: ./teardown.sh $REGION <id>"
  exit 0
fi

echo "==> Disabling deletion protection on $ID ($REGION) ..."
aws dsql update-cluster --region "$REGION" --identifier "$ID" --no-deletion-protection-enabled >/dev/null

echo "==> Deleting cluster $ID ..."
aws dsql delete-cluster --region "$REGION" --identifier "$ID" >/dev/null

echo "==> Waiting for deletion ..."
for _ in $(seq 1 60); do
  sleep 5
  STATUS=$(aws dsql get-cluster --region "$REGION" --identifier "$ID" --output json 2>/dev/null | jq -r '.status' 2>/dev/null || echo "")
  [ -z "$STATUS" ] && break
  echo "    status = $STATUS"
done
echo "==> Done. $ID is deleted (or PENDING_DELETE awaiting its peer)."
