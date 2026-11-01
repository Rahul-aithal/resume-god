#!/bin/sh
# Back up the resume-god Postgres database to a timestamped dump.
# Usage: ./scripts/backup-db.sh [output-dir]
# Requires: the db service running (docker compose up -d db), or a local
# DATABASE_URL in the environment.
set -eu

OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$OUT_DIR/resume-god-$STAMP.dump"

if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "resume-god-db"; then
  docker exec resume-god-db pg_dump -U "${POSTGRES_USER:-resume_god}" "${POSTGRES_DB:-resume_god}" > "$FILE"
else
  pg_dump "${DATABASE_URL:?set DATABASE_URL or start the db service}" > "$FILE"
fi

echo "Backup written to $FILE"

# Restore with:
#   docker exec -i resume-god-db psql -U resume_god resume_god < <backup-file>
# Or drop + recreate first for a clean restore:
#   docker exec resume-god-db psql -U resume_god -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
