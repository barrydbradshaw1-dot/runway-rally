#!/usr/bin/env bash
# Dump the bundled Postgres to ./backups/rally-YYYYmmdd-HHMM.sql.gz and keep the last 14.
# Schedule with cron, and copy the files off the droplet (for example to DigitalOcean Spaces).
# With Managed Postgres, use the provider's automatic backups instead.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups
out="backups/rally-$(date +%Y%m%d-%H%M).sql.gz"
docker compose --profile localdb exec -T db pg_dump -U rally rally | gzip > "$out"
ls -1t backups/rally-*.sql.gz | tail -n +15 | xargs -r rm --
echo "wrote $out"
