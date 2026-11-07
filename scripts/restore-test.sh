#!/usr/bin/env bash
# Prove a backup restores: load the newest dump into a throwaway database and count students.
# Run this before any real student signs in.
set -euo pipefail
cd "$(dirname "$0")/.."
f="$(ls -1t backups/rally-*.sql.gz | head -1)"
echo "restoring $f into a temporary database"
docker compose --profile localdb exec -T db psql -U rally -d postgres -c "DROP DATABASE IF EXISTS restore_test;" -c "CREATE DATABASE restore_test;"
gunzip -c "$f" | docker compose --profile localdb exec -T db psql -U rally -d restore_test -q
docker compose --profile localdb exec -T db psql -U rally -d restore_test -c "SELECT count(*) AS students FROM students;"
docker compose --profile localdb exec -T db psql -U rally -d postgres -c "DROP DATABASE restore_test;"
echo "restore OK"
