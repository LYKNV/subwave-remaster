#!/usr/bin/env bash
# Pull latest code, rebuild changed images, and recreate only services whose
# image or config actually changed. Run from anywhere; resolves to repo root.

set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
COMPOSE="docker compose -f ${COMPOSE_FILE}"

echo "→ Pulling latest from origin"
git pull --ff-only

echo "→ Pulling base images"
$COMPOSE pull --ignore-buildable

echo "→ Building local images"
$COMPOSE build --pull

echo "→ Recreating changed services"
$COMPOSE up -d --remove-orphans

echo "→ Pruning dangling images"
docker image prune -f >/dev/null

echo
echo "✓ Update complete"
$COMPOSE ps
