#!/usr/bin/env bash
# Usage: ./scripts/import_ddl_to_mysql.sh /path/to/fb-dev.sql
set -euo pipefail
DDL_FILE=${1:-fb-dev.sql}
MYSQL_HOST=${MYSQL_HOST:-127.0.0.1}
MYSQL_PORT=${MYSQL_PORT:-3306}
MYSQL_USER=${MYSQL_USER:-dev}
MYSQL_PASSWORD=${MYSQL_PASSWORD:-dev}
MYSQL_DB=${MYSQL_DB:-fb_dev}

if [ ! -f "$DDL_FILE" ]; then
  echo "DDL file not found: $DDL_FILE"
  exit 2
fi

echo "Importing $DDL_FILE into ${MYSQL_HOST}:${MYSQL_PORT}/${MYSQL_DB} as ${MYSQL_USER}"
mysql -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DB" < "$DDL_FILE"
echo "Import complete"
