#!/bin/bash
set -e

echo "==> Starte Docker Container..."
docker compose up -d

echo "==> Warte auf MariaDB..."
until docker exec sse_db healthcheck.sh --connect --innodb_initialized 2>/dev/null; do
  sleep 2
done

echo "==> Installiere Dependencies..."
npm install

echo "==> Erstelle Super-Admin..."
SUPER_ADMIN_USERNAME=admin \
SUPER_ADMIN_EMAIL=admin@example.com \
SUPER_ADMIN_PASSWORD='Admin1234!' \
npm run bootstrap:super-admin

echo "==> Starte Server..."
npm run dev
