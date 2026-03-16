#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# 1. Copy .env if it does not exist yet
if [ ! -f .env ]; then
  echo "[start] .env not found — copying from .env.example"
  cp .env.example .env
  echo "[start] Review .env and change passwords / JWT_SECRET_KEY before production use."
fi

# 2. Build images and start all services in the background
echo "[start] Building and starting containers..."
docker compose up --build -d

# 3. Wait for the API to be healthy (postgres readiness is handled by healthcheck)
echo "[start] Waiting for API to be ready..."
until docker compose exec -T api curl -sf http://localhost:8000/health > /dev/null 2>&1; do
  sleep 2
done
echo "[start] API is up."

# 4. Run database migrations (no-op if already at head)
echo "[start] Running Alembic migrations..."
docker compose exec -T api alembic upgrade head

# 5. Seed demo data (idempotent — safe to run multiple times)
echo "[start] Seeding demo data..."
docker compose exec -T api python -m app.seed

echo ""
echo "==========================================="
echo "  Exam Engine is ready at http://localhost"
echo "  Login: admin@university.edu / admin123"
echo "  API docs: http://localhost/docs"
echo "==========================================="
