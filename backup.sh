#!/bin/bash
# SQLite backup with WAL checkpoint — safe for live database.
# Runs daily via cron. Keeps 30 days of backups.
set -euo pipefail

DB_PATH="/root/expense_tracker/data/expenses.db"
BACKUP_DIR="/root/expense_tracker/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/expenses_${TIMESTAMP}.db"

mkdir -p "$BACKUP_DIR"

# Use SQLite's built-in backup command (safe under concurrent writes)
sqlite3 "$DB_PATH" ".backup '${BACKUP_FILE}'"

# Compress it
gzip "$BACKUP_FILE"

echo "[$(date)] Backup saved: ${BACKUP_FILE}.gz"

# Delete backups older than 30 days
find "$BACKUP_DIR" -name "expenses_*.db.gz" -mtime +30 -delete

echo "[$(date)] Cleanup complete. Current backups:"
ls -lh "$BACKUP_DIR"
