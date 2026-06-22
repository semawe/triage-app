#!/bin/bash
set -euo pipefail

LOG="/home/debian/deploy-triage-app.log"
exec >> "$LOG" 2>&1
echo "=== Deploy triage-app $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

cd /home/debian/triage-app

git pull origin main
npm ci --ignore-scripts

# Charger les variables d'environnement pour les migrations Prisma
set -a && . .env.local && set +a

# Migrations Prisma (mode prod — ne génère pas les artefacts, applique seulement)
npx prisma migrate deploy

# Build atomique : le .next servi par PM2 reste intact pendant le build
NEXT_DIST_DIR=.next-build npm run build
rm -rf .next.old && mv .next .next.old && mv .next-build .next

pm2 reload triage-app

echo "=== Deploy OK ==="
