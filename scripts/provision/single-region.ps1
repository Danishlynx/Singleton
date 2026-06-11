<#
.SYNOPSIS
  Provision a single-region Amazon Aurora DSQL cluster and print the connection endpoint.

.DESCRIPTION
  Creates a DSQL cluster (deletion protection OFF for the hackathon), waits until it is
  ACTIVE, derives the endpoint hostname, and optionally generates an admin auth token so
  you can smoke-test with psql. Append the printed endpoint to .env.local as
  DSQL_CLUSTER_ENDPOINT and set AWS_REGION to the same region.

  Prereqs: AWS CLI v2 installed and configured (aws configure) with an IAM principal that
  can call dsql:CreateCluster / dsql:GetCluster and (to connect) dsql:DbConnectAdmin.

.EXAMPLE
  ./single-region.ps1 -Region us-east-1
#>
param(
  [string]$Region = "us-east-1",
  [string]$Name   = "singleton",
  [switch]$NoToken
)

$ErrorActionPreference = "Stop"

function Require-Aws {
  try { aws dsql help *> $null } catch {
    throw "AWS CLI v2 with the 'dsql' command is required. Install: https://aws.amazon.com/cli/ then run 'aws configure'."
  }
}

Require-Aws
Write-Host "==> Identity:" -ForegroundColor Cyan
aws sts get-caller-identity --output table

Write-Host "==> Creating DSQL cluster in $Region ..." -ForegroundColor Cyan
$create = aws dsql create-cluster `
  --region $Region `
  --no-deletion-protection-enabled `
  --tags "Name=$Name,project=singleton" `
  --output json | ConvertFrom-Json

$identifier = $create.identifier
$arn        = $create.arn
Write-Host "    identifier = $identifier"
Write-Host "    arn        = $arn"

Write-Host "==> Waiting for ACTIVE (this can take a minute) ..." -ForegroundColor Cyan
do {
  Start-Sleep -Seconds 5
  $status = (aws dsql get-cluster --region $Region --identifier $identifier --output json | ConvertFrom-Json).status
  Write-Host "    status = $status"
} while ($status -ne "ACTIVE")

$endpoint = "$identifier.dsql.$Region.on.aws"

Write-Host ""
Write-Host "==> Cluster ACTIVE." -ForegroundColor Green
Write-Host "    Endpoint: $endpoint"
Write-Host ""
Write-Host "Add to .env.local:" -ForegroundColor Yellow
Write-Host "    AWS_REGION=$Region"
Write-Host "    DSQL_CLUSTER_ENDPOINT=$endpoint"
Write-Host "    CLUSTER_USER=admin"
Write-Host ""
Write-Host "Cluster ARN (for the IAM policy in scripts/provision/iam-policy.json):" -ForegroundColor Yellow
Write-Host "    $arn"

if (-not $NoToken) {
  Write-Host ""
  Write-Host "==> Generating a short-lived admin auth token (psql smoke test):" -ForegroundColor Cyan
  $token = aws dsql generate-db-connect-admin-auth-token --region $Region --expires-in 3600 --hostname $endpoint
  Write-Host "    To connect (requires psql):"
  Write-Host "    `$env:PGSSLMODE='require'; `$env:PGPASSWORD='<token>'; psql --dbname postgres --username admin --host $endpoint"
  Write-Host "    (token length: $($token.Length) chars — not printed)"
}
