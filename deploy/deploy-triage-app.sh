#!/bin/bash
# Miroir versionné de /opt/deploybot/deploy-triage-app.sh sur le VPS.
# La copie qui tourne réellement est celle du serveur : toute modification ici doit y être
# reportée, et inversement. Le miroir avait dérivé entre le 25/06 et le 10/08/2026 (il
# décrivait encore PM2, SKIP_BUILD_CHECKS et un log sous /home/debian) sans que la prod
# bronche — même piège que celui déjà constaté sur of-qualiopi.
#
# Depuis le durcissement du 09/08/2026 :
#   - le script est exécuté par l identité de service deploybot, plus par debian ;
#   - le corps applicatif tourne via sudo -u triageapp ;
#   - le service est supervisé par systemd, plus par PM2 ;
#   - le journal vit dans /var/log/deploybot/ (lisible sans sudo, utile au diagnostic).
#
# Depuis le 15/08/2026, déploiement BLEU/VERT : la nouvelle version est construite et
# démarrée sur le port inactif, on attend qu elle réponde, puis nginx pivote dessus par un
# reload gracieux avant que l ancienne soit arrêtée. À aucun moment nginx ne pointe vers un
# port qui n écoute pas. Auparavant, un `systemctl restart` sur l unique instance coupait
# le service une à deux minutes à chaque déploiement, en servant des 502 aux visiteurs.
#
# Les deux couleurs sont deux instances du template triage-app@.service, nommées par leur
# port : triage-app@3002 et triage-app@3003, chacune servant son propre répertoire de build
# (.next-3002 / .next-3003). Les gestes privilégiés (systemd, nginx) passent par
# /usr/local/sbin/triapp-bascule, ouvert à deploybot par six entrées sudo littérales.
#
# Attention : le corps applicatif vit dans un bash -lc entre apostrophes simples.
# Ne jamais y introduire d apostrophe droite, elle refermerait le bloc et casserait tout.
set -euo pipefail
exec >> /var/log/deploybot/deploy-triage-app.log 2>&1
echo "=== Deploy triage-app $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

DEPOT=/home/debian/triage-app
UPSTREAM=/etc/nginx/conf.d/triapp-upstream.conf
BASCULE=/usr/local/sbin/triapp-bascule
DELAI_SANTE=180   # secondes accordées à la nouvelle instance pour répondre
DELAI_DRAIN=20    # requêtes encore en vol sur l ancienne, une fois nginx basculé

dans_le_depot() { sudo -u triageapp bash -lc "cd $DEPOT && $1"; }

PORT_ACTIF=$(grep -oE 'server 127\.0\.0\.1:[0-9]+' "$UPSTREAM" | grep -oE '[0-9]+$' || true)
case "$PORT_ACTIF" in
  3002) PORT_CIBLE=3003 ;;
  3003) PORT_CIBLE=3002 ;;
  *) echo "!!! Port actif illisible dans $UPSTREAM (lu: ${PORT_ACTIF:-rien}) — arrêt"; exit 1 ;;
esac
echo "--- Couleur en service : $PORT_ACTIF — cible du déploiement : $PORT_CIBLE"

# Rien de ce qui suit ne touche à l instance en service : elle continue de répondre même
# si le build échoue. Un déploiement raté laisse la production intacte, sans intervention.
dans_le_depot 'git pull origin main'
dans_le_depot 'npm ci --ignore-scripts'
dans_le_depot 'set -a && . .env.local && set +a && npx prisma migrate deploy'
dans_le_depot "rm -rf .next-$PORT_CIBLE && NEXT_DIST_DIR=.next-$PORT_CIBLE npm run build"

echo "--- Démarrage de triage-app@$PORT_CIBLE"
sudo "$BASCULE" demarrer "$PORT_CIBLE"

echo "--- Attente de /api/health sur $PORT_CIBLE"
PRET=0
for SECONDE in $(seq 1 "$DELAI_SANTE"); do
  if curl -fsS -m 3 -o /dev/null "http://127.0.0.1:$PORT_CIBLE/api/health"; then
    echo "--- Prête après ${SECONDE}s"
    PRET=1
    break
  fi
  sleep 1
done

if [ "$PRET" -ne 1 ]; then
  echo "!!! Aucune réponse sur $PORT_CIBLE après ${DELAI_SANTE}s — la production reste sur $PORT_ACTIF"
  sudo "$BASCULE" arreter "$PORT_CIBLE" || true
  exit 1
fi

echo "--- Bascule de nginx vers $PORT_CIBLE"
sudo "$BASCULE" activer "$PORT_CIBLE"

echo "--- Drain de ${DELAI_DRAIN}s, puis arrêt de triage-app@$PORT_ACTIF"
sleep "$DELAI_DRAIN"
sudo "$BASCULE" arreter "$PORT_ACTIF" || true

echo "=== Deploy OK (en service sur $PORT_CIBLE) ==="
