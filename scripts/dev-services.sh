#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -f .env.local ]; then cp .env.example .env.local; fi
if docker container inspect weekend-postgres >/dev/null 2>&1; then
  docker start weekend-postgres >/dev/null
else
  docker compose up -d postgres
fi
for attempt in {1..30}; do
  if docker exec weekend-postgres pg_isready -U weekend -d weekend >/dev/null 2>&1; then break; fi
  if [ "$attempt" -eq 30 ]; then echo 'PostgreSQL did not become ready.' >&2; exit 1; fi
  sleep 1
done
npm run db:migrate
npm run db:seed
printf '%s\n' 'Database ready. In separate terminals run: npm run storage:dev and npm run dev'
