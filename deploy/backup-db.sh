#!/usr/bin/env bash
# Dump the prod Postgres (baytara) from the docker container, gzip, keep the last 14.
set -euo pipefail
DIR=/var/lib/baytara/backups
mkdir -p "$DIR"
TS=$(date +%Y%m%d-%H%M%S)
OUT="$DIR/baytara-$TS.sql.gz"
docker exec -e PGPASSWORD=baytara baytara-pg pg_dump -U baytara baytara | gzip > "$OUT"
# rotation: keep newest 14, drop the rest
ls -1t "$DIR"/baytara-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
echo "backup: $OUT ($(du -h "$OUT" | cut -f1))"
