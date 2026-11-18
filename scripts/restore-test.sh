#!/usr/bin/env bash
# Prove a backup restores: load the newest dump into a throwaway database and count students.
# Encrypted backups (.sql.gz.enc) are opened with BACKUP_PASSPHRASE from .env.
# Run this before any real student signs in, and again after setting or changing the passphrase.
set -euo pipefail
cd "$(dirname "$0")/.."
shopt -s nullglob
all=(backups/rally-*.sql.gz backups/rally-*.sql.gz.enc)
[ "${#all[@]}" -gt 0 ] || { echo "no backups yet: run bash scripts/backup.sh first" >&2; exit 1; }
f="$(ls -1t -- "${all[@]}" | head -1)"

pass="$(grep -m1 '^BACKUP_PASSPHRASE=' .env 2>/dev/null | cut -d= -f2- || true)"
pass="${pass%\"}"; pass="${pass#\"}"; pass="${pass%\'}"; pass="${pass#\'}"
open_backup() {
  case "$f" in
    *.enc)
      [ -n "$pass" ] || { echo "$f is encrypted and BACKUP_PASSPHRASE is not set in .env" >&2; exit 1; }
      RR_BACKUP_PASS="$pass" openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:RR_BACKUP_PASS < "$f" | gunzip -c ;;
    *) gunzip -c "$f" ;;
  esac
}

echo "restoring $f into a temporary database"
docker compose --profile localdb exec -T db psql -U rally -d postgres -c "DROP DATABASE IF EXISTS restore_test;" -c "CREATE DATABASE restore_test;"
open_backup | docker compose --profile localdb exec -T db psql -U rally -d restore_test -q -v ON_ERROR_STOP=1
docker compose --profile localdb exec -T db psql -U rally -d restore_test -c "SELECT count(*) AS students FROM students;"
docker compose --profile localdb exec -T db psql -U rally -d postgres -c "DROP DATABASE restore_test;"
echo "restore OK"
