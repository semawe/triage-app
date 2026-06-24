#!/usr/bin/env bash
# Backup quotidien triageapp_prod — pg_dump + gzip + rotation 7 jours
set -euo pipefail

BACKUP_DIR="/home/debian/backups/triageapp"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="triageapp_${TIMESTAMP}.sql.gz"
LOG="/home/debian/backup-triageapp.log"
ENV_FILE="/home/debian/triage-app/.env.local"

log() { echo "[$(date +"%Y-%m-%d %H:%M:%S")] $1" | tee -a "$LOG"; }

# Lire DATABASE_URL depuis .env.local
if [ ! -f "$ENV_FILE" ]; then
  log "ERREUR : $ENV_FILE introuvable"
  exit 1
fi

DATABASE_URL=$(grep "^DATABASE_URL=" "$ENV_FILE" | cut -d= -f2- | tr -d '"')
if [ -z "$DATABASE_URL" ]; then
  log "ERREUR : DATABASE_URL absent de $ENV_FILE"
  exit 1
fi

# Parser postgresql://user:password@host:port/dbname
PGUSER=$(echo "$DATABASE_URL" | sed 's|postgresql://||' | cut -d: -f1)
PGPASSWORD=$(echo "$DATABASE_URL" | sed 's|postgresql://[^:]*:||' | cut -d@ -f1)
PGHOST=$(echo "$DATABASE_URL" | cut -d@ -f2 | cut -d: -f1)
PGPORT=$(echo "$DATABASE_URL" | cut -d@ -f2 | cut -d: -f2 | cut -d/ -f1)
PGDATABASE=$(echo "$DATABASE_URL" | cut -d/ -f4)

log "Démarrage backup $PGDATABASE"

PGPASSWORD="$PGPASSWORD" pg_dump -U "$PGUSER" -h "$PGHOST" -p "$PGPORT" "$PGDATABASE" \
  | gzip > "${BACKUP_DIR}/${FILENAME}"

SIZE=$(du -sh "${BACKUP_DIR}/${FILENAME}" | cut -f1)
log "Dump créé : ${FILENAME} (${SIZE})"

DELETED=$(find "$BACKUP_DIR" -name "triageapp_*.sql.gz" -mtime +7 -print -delete | wc -l)
[ "$DELETED" -gt 0 ] && log "Rotation : ${DELETED} fichier(s) supprimé(s)"

log "Backup terminé"
