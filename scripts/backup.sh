#!/usr/bin/env bash
# Dump the bundled Postgres to ./backups/ and keep the last 14.
#
# With BACKUP_PASSPHRASE set in .env, each backup is encrypted (AES-256, key from the passphrase) and
# named rally-YYYYmmdd-HHMM.sql.gz.enc. Keep a copy of the passphrase somewhere other than this
# server (a password manager): without it no backup can be restored. See README "Backups".
# Without BACKUP_PASSPHRASE it still runs, as before, but warns that the backup is not encrypted.
#
# Schedule with cron, and copy the files off the droplet (for example to DigitalOcean Spaces).
# With Managed Postgres, use the provider's automatic backups instead.
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
mkdir -p backups
chmod 700 backups

# the passphrase from .env (surrounding quotes are allowed)
pass="$(grep -m1 '^BACKUP_PASSPHRASE=' .env 2>/dev/null | cut -d= -f2- || true)"
pass="${pass%\"}"; pass="${pass#\"}"; pass="${pass%\'}"; pass="${pass#\'}"

stamp="$(date +%Y%m%d-%H%M)"
trap 'rm -f -- "${out:-}.part"' EXIT  # a failed dump leaves no half-written file
dump() { docker compose --profile localdb exec -T db pg_dump -U rally rally; }

if [ -n "$pass" ]; then
  if [ "${#pass}" -lt 16 ]; then echo "BACKUP_PASSPHRASE is too short: use at least 16 characters (openssl rand -base64 32)" >&2; exit 1; fi
  out="backups/rally-$stamp.sql.gz.enc"
  dump | gzip | RR_BACKUP_PASS="$pass" openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -pass env:RR_BACKUP_PASS > "$out.part"
else
  echo "WARNING: BACKUP_PASSPHRASE is not set in .env, so this backup is NOT encrypted. See README \"Backups\"." >&2
  out="backups/rally-$stamp.sql.gz"
  dump | gzip > "$out.part"
fi
mv "$out.part" "$out"

# keep the newest 14 backups, encrypted or not
shopt -s nullglob
all=(backups/rally-*.sql.gz backups/rally-*.sql.gz.enc)
if [ "${#all[@]}" -gt 14 ]; then ls -1t -- "${all[@]}" | tail -n +15 | xargs -r rm --; fi
echo "wrote $out"

plain=(backups/rally-*.sql.gz)
if [ -n "$pass" ] && [ "${#plain[@]}" -gt 0 ]; then
  echo "${#plain[@]} older backup(s) are not encrypted. Once you have checked an encrypted one restores"
  echo "(bash scripts/restore-test.sh), remove them with:  rm backups/rally-*.sql.gz"
fi
