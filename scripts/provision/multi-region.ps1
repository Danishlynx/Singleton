<#
.SYNOPSIS
  Provision a multi-Region PEERED Aurora DSQL pair (two active endpoints, one logical DB).

.DESCRIPTION
  Creates one cluster in each active region (default us-east-1 + us-east-2) sharing a
  witness region (default us-west-2), then peers them by calling update-cluster on each
  with the OTHER cluster's ARN under multiRegionProperties.clusters. Both endpoints accept
  reads AND writes and present a single strongly-consistent database.

  The clusters sit in PENDING_SETUP until BOTH peering calls land, then transition
  CREATING -> ACTIVE. The script waits for both to reach ACTIVE.

  Prereqs: AWS CLI v2 configured; witness region must be US-based and DSQL-supported.

.EXAMPLE
  ./multi-region.ps1 -RegionA us-east-1 -RegionB us-east-2 -Witness us-west-2
#>
param(
  [string]$RegionA = "us-east-1",
  [string]$RegionB = "us-east-2",
  [string]$Witness = "us-west-2",
  [string]$Name    = "singleton-mr"
)

$ErrorActionPreference = "Stop"
$mrProps = "{`"witnessRegion`":`"$Witness`"}"

function Wait-Active($Region, $Id) {
  do {
    Start-Sleep -Seconds 5
    $status = (aws dsql get-cluster --region $Region --identifier $Id --output json | ConvertFrom-Json).status
    Write-Host "    [$Region/$Id] status = $status"
  } while ($status -ne "ACTIVE")
}

Write-Host "==> Creating cluster A in $RegionA (witness $Witness) ..." -ForegroundColor Cyan
$a = aws dsql create-cluster --region $RegionA --no-deletion-protection-enabled `
  --multi-region-properties $mrProps --tags "Name=$Name-a,project=singleton" --output json | ConvertFrom-Json
Write-Host "    A identifier = $($a.identifier)  arn = $($a.arn)"

Write-Host "==> Creating cluster B in $RegionB (witness $Witness) ..." -ForegroundColor Cyan
$b = aws dsql create-cluster --region $RegionB --no-deletion-protection-enabled `
  --multi-region-properties $mrProps --tags "Name=$Name-b,project=singleton" --output json | ConvertFrom-Json
Write-Host "    B identifier = $($b.identifier)  arn = $($b.arn)"

Write-Host "==> Peering A -> B ..." -ForegroundColor Cyan
$peerA = "{`"witnessRegion`":`"$Witness`",`"clusters`":[`"$($b.arn)`"]}"
aws dsql update-cluster --region $RegionA --identifier $a.identifier --multi-region-properties $peerA | Out-Null

Write-Host "==> Peering B -> A ..." -ForegroundColor Cyan
$peerB = "{`"witnessRegion`":`"$Witness`",`"clusters`":[`"$($a.arn)`"]}"
aws dsql update-cluster --region $RegionB --identifier $b.identifier --multi-region-properties $peerB | Out-Null

Write-Host "==> Waiting for both clusters to reach ACTIVE ..." -ForegroundColor Cyan
Wait-Active $RegionA $a.identifier
Wait-Active $RegionB $b.identifier

$endpointA = "$($a.identifier).dsql.$RegionA.on.aws"
$endpointB = "$($b.identifier).dsql.$RegionB.on.aws"

Write-Host ""
Write-Host "==> Peered pair ACTIVE." -ForegroundColor Green
Write-Host "Add to .env.local (primary = nearer region):" -ForegroundColor Yellow
Write-Host "    AWS_REGION=$RegionA"
Write-Host "    DSQL_CLUSTER_ENDPOINT=$endpointA"
Write-Host "    AWS_REGION_SECONDARY=$RegionB"
Write-Host "    DSQL_CLUSTER_ENDPOINT_SECONDARY=$endpointB"
Write-Host "    CLUSTER_USER=admin"
Write-Host ""
Write-Host "Teardown later requires disabling deletion protection on BOTH, then delete-cluster in each region."
