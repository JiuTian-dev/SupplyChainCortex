# ===========================================
# SupplyChain Cortex — PostgreSQL Backup (Windows)
# ===========================================
# Usage:
#   .\scripts\backup-db.ps1
#   .\scripts\backup-db.ps1 -OutputDir D:\backups -RetentionDays 14
#
# Scheduled Task (daily at 3am):
#   schtasks /Create /TN "SC-Backup" /TR "powershell -File C:\...\scripts\backup-db.ps1" /SC DAILY /ST 03:00
# ===========================================

param(
    [string]$OutputDir = (Join-Path $PSScriptRoot "..\backups"),
    [int]$RetentionDays = 30
)

$ErrorActionPreference = "Stop"

$DB_HOST = if ($env:DB_HOST) { $env:DB_HOST } else { "localhost" }
$DB_PORT = if ($env:DB_PORT) { $env:DB_PORT } else { "5432" }
$DB_USER = if ($env:DB_USER) { $env:DB_USER } else { "supplychain" }
$DB_NAME = if ($env:DB_NAME) { $env:DB_NAME } else { "supply_chain" }
$env:PGPASSWORD = if ($env:PGPASSWORD) { $env:PGPASSWORD } else { "supplychain" }

if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
    Write-Error "pg_dump not found. Install PostgreSQL client tools."
    exit 1
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$filepath = Join-Path $OutputDir "${DB_NAME}_${timestamp}.sql.gz"

Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Starting backup → $filepath"

& pg_dump `
    --host=$DB_HOST --port=$DB_PORT --username=$DB_USER --dbname=$DB_NAME `
    --format=custom --compress=9 --file=$filepath

if ($LASTEXITCODE -ne 0) {
    Write-Error "Backup failed!"
    Remove-Item -Force $filepath -ErrorAction SilentlyContinue
    exit 1
}

$size = (Get-Item $filepath).Length
Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Backup complete: $([math]::Round($size/1KB, 1)) KB"

# Rotate old backups
$oldFiles = Get-ChildItem $OutputDir -Filter "${DB_NAME}_*.sql.gz" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) }
if ($oldFiles.Count -gt 0) {
    $oldFiles | Remove-Item -Force
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Rotated $($oldFiles.Count) old backup(s)"
}
