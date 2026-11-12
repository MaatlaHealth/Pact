#!/usr/bin/env bash
set -euo pipefail

# Entry point for the PACT image. PROCESS=web runs migrations, seeds the
# platform agents, and starts Next.js. PROCESS=worker starts the job worker.

if [ "${PROCESS:-web}" = "web" ]; then
  echo "Applying database migrations"
  npx prisma migrate deploy
  echo "Seeding platform agents"
  npx tsx prisma/seed.ts
  echo "Starting web server on port ${PORT:-3000}"
  exec npx next start -p "${PORT:-3000}"
else
  echo "Starting worker"
  exec npx tsx src/worker/index.ts
fi
