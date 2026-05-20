#!/bin/bash
# ===========================================
# SupplyChain Cortex — PostgreSQL Backup Script
# ===========================================
# Usage:
#   ./scripts/backup-db.sh                    → dump to backups/ dir
#   ./scripts/backup-db.sh -o /mnt/backups    → custom output dir
#   ./scripts/backup-db.sh -r 14              → retain 14 days (default: 30)
#
# Cron (daily at 3am):
#   0 3 * * * /path/to/scripts/backup-db.sh >> /var/log/sc-backup.log 2>&1
#
# Restore from backup:
#   gunzip -c backups/supply_chain_2026-05-19_030000.sql.gz | \
#     psql -h localhost -U supplychain -d supply_chain
# ===========================================

set -euo pipefail

# ─── Configuration ──────────────────────────────────────────────────────────────
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-supplychain}"
DB_NAME="${DB_NAME:-supply_chain}"
# Use PGPASSWORD env var or .pgpass file
export PGPASSWORD="${PGPASSWORD:-supplychain}"

OUTPUT_DIR="${OUTPUT_DIR:-$(dirname "$0")/../backups}"
RETENTION_DAYS=30

# ─── Parse Arguments ───────────────────────────────────────────────────────────
while getopts "o:r:h" opt; do
  case $opt in
    o) OUTPUT_DIR="$OPTARG" ;;
    r) RETENTION_DAYS="$OPTARG" ;;
    h)
      echo "Usage: $0 [-o output_dir] [-r retention_days]"
      exit 0
      ;;
    *) exit 1 ;;
  esac
done

# ─── Validate Prerequisites ─────────────────────────────────────────────────────
if ! command -v pg_dump &> /dev/null; then
  echo "[ERROR] pg_dump not found. Install PostgreSQL client tools."
  exit 1
fi

# ─── Prepare ────────────────────────────────────────────────────────────────────
mkdir -p "$OUTPUT_DIR"

TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
FILENAME="${DB_NAME}_${TIMESTAMP}.sql.gz"
FILEPATH="${OUTPUT_DIR}/${FILENAME}"
LOCKFILE="${OUTPUT_DIR}/.backup.lock"

# ─── Prevent Concurrent Runs ────────────────────────────────────────────────────
if [ -f "$LOCKFILE" ]; then
  echo "[WARN] Another backup is running (lockfile exists). Exiting."
  exit 0
fi
trap 'rm -f "$LOCKFILE"' EXIT
touch "$LOCKFILE"

# ─── Dump ───────────────────────────────────────────────────────────────────────
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting backup → ${FILEPATH}"

if pg_dump \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --format=custom \
    --compress=9 \
    --file="$FILEPATH" \
    2>&1; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup complete: $(du -h "$FILEPATH" | cut -f1)"
else
  echo "[ERROR] Backup failed!"
  rm -f "$FILEPATH"
  exit 1
fi

# ─── Rotate Old Backups ─────────────────────────────────────────────────────────
DELETED=$(find "$OUTPUT_DIR" -name "${DB_NAME}_*.sql.gz" -type f -mtime +"$RETENTION_DAYS" -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Rotated $DELETED old backup(s)"
fi

# ─── Summary ────────────────────────────────────────────────────────────────────
TOTAL_SIZE=$(du -sh "$OUTPUT_DIR" | cut -f1)
TOTAL_COUNT=$(find "$OUTPUT_DIR" -name "${DB_NAME}_*.sql.gz" -type f | wc -l)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup dir: $TOTAL_COUNT file(s), $TOTAL_SIZE total"
