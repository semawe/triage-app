#!/bin/bash
# Miroir versionné de /opt/deploybot/deploy-triage-app.sh sur le VPS.
# La copie qui tourne réellement est celle du serveur : toute modification ici doit y être
# reportée, et inversement. Le miroir avait dérivé entre le 25/06 et le 10/08/2026 (il
# décrivait encore PM2, SKIP_BUILD_CHECKS et un log sous /home/debian) sans que la prod
# bronche — même piège que celui déjà constaté sur of-qualiopi.
#
# Depuis le durcissement du 09/08/2026 :
#   - le script est exécuté par lidentité de service deploybot, plus par debian ;
#   - le corps applicatif tourne via sudo -u triageapp ;
#   - le service est supervisé par systemd (triage-app.service), plus par PM2 ;
#   - le journal vit dans /var/log/deploybot/ (lisible sans sudo, utile au diagnostic).
#
# Attention : le corps ci-dessous vit dans un bash -lc entre apostrophes simples.
# Ne jamais y introduire dapostrophe droite, elle refermerait le bloc et casserait tout.
set -euo pipefail
exec >> /var/log/deploybot/deploy-triage-app.log 2>&1
echo "=== Deploy triage-app $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
sudo -u triageapp bash -lc 'cd /home/debian/triage-app && git pull origin main && npm ci --ignore-scripts && set -a && . .env.local && set +a && npx prisma migrate deploy && NEXT_DIST_DIR=.next-build npm run build && rm -rf .next.old && mv .next .next.old && mv .next-build .next'
sudo systemctl restart triage-app
echo "=== Deploy OK ==="
