#!/usr/bin/env bash
# Build and (re)start the stack. Run from the repo root as the "rally" user.
# Uses the bundled Postgres when DATABASE_URL points at the "db" host, otherwise the managed one.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "Create .env first (cp .env.example .env)"; exit 1; }
grep -q '^ADMIN_TOKEN=.\+' .env || { echo "Set ADMIN_TOKEN in .env (openssl rand -hex 24)"; exit 1; }

PROFILE=""
if grep -q '^DATABASE_URL=.*@db:' .env; then PROFILE="--profile localdb"; fi

git pull --ff-only 2>/dev/null || echo "(skipped git pull)"
docker compose $PROFILE up -d --build
docker compose $PROFILE ps
echo "Health check:"; sleep 3
curl -fsS "https://$(grep '^DOMAIN=' .env | cut -d= -f2)/healthz" || echo "not reachable yet (DNS or certificate may still be settling)"
echo
