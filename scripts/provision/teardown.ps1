<#
.SYNOPSIS
  Delete an Aurora DSQL cluster (cost cleanup → guarantees no further charges).

.DESCRIPTION
  Lists clusters when run with no -Identifier so you can see what exists, or deletes the
  given cluster (turning off deletion protection first, idempotently). For a peered
  multi-region pair, run this once per region (us-east-1 AND us-east-2) — a cluster stays
  in PENDING_DELETE until its peer is also deleted.

  Aurora DSQL is pay-per-use with no instance charge, so an idle cluster costs ~nothing,
  but deleting it removes all doubt.

.EXAMPLE
  ./teardown.ps1 -Region us-east-1                       # list clusters in the region
  ./teardown.ps1 -Region us-east-1 -Identifier <id>      # delete that cluster
#>
param(
  [string]$Region = "us-east-1",
  [string]$Identifier
)

$ErrorActionPreference = "Stop"

if (-not $Identifier) {
  Write-Host "Clusters in ${Region}:" -ForegroundColor Cyan
  aws dsql list-clusters --region $Region --output table
  Write-Host ""
  Write-Host "Re-run with -Identifier <id> to delete one. (Multi-region: run once per region.)" -ForegroundColor Yellow
  return
}

Write-Host "==> Disabling deletion protection on $Identifier ($Region) ..." -ForegroundColor Cyan
aws dsql update-cluster --region $Region --identifier $Identifier --no-deletion-protection-enabled | Out-Null

Write-Host "==> Deleting cluster $Identifier ..." -ForegroundColor Cyan
aws dsql delete-cluster --region $Region --identifier $Identifier | Out-Null

Write-Host "==> Waiting for deletion ..." -ForegroundColor Cyan
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 5
  try {
    $status = (aws dsql get-cluster --region $Region --identifier $Identifier --output json 2>$null | ConvertFrom-Json).status
    if (-not $status) { break }
    Write-Host "    status = $status"
  } catch {
    break  # get-cluster fails once the cluster is gone
  }
}
Write-Host "==> Done. $Identifier is deleted (or PENDING_DELETE awaiting its peer)." -ForegroundColor Green
