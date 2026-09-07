#!/bin/sh
set -eu

database_url="${DATABASE_URL:-postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public}"

docker compose up -d db minio

attempt=0
until docker compose exec -T db pg_isready -U sublet -d sublet_pipeline >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "PostgreSQL did not become ready within 30 seconds." >&2
    exit 1
  fi
  sleep 1
done

# Run in the foreground so bucket setup failures stop the setup command.
docker compose run --rm minio-init

if [ ! -f api/.env ]; then
  cp api/.env.example api/.env
fi

DATABASE_URL="$database_url" pnpm --dir api prisma migrate deploy
DATABASE_URL="$database_url" pnpm --dir api seed:la

echo "Local database is migrated and seeded."
