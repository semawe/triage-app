# Déploiement — triage-app (triapp.fr)

VPS OVH `debian@145.239.55.58` (box `semawe-prod-gra11`), partagé avec of-qualiopi,
l'Académie et inscriptions : `ssh -i ~/.ssh/id_semawe_vps2 debian@145.239.55.58`.

Les fichiers de ce dossier sont des **miroirs versionnés** de ce qui vit sur le serveur.
Seule la copie du serveur s'exécute : toute retouche ici se reporte là-bas, et inversement.
Le miroir du script de déploiement avait dérivé entre le 25/06 et le 10/08/2026 sans que
la prod bronche — c'est le piège à connaître.

| Ici | Sur le VPS |
| --- | --- |
| `deploy-triage-app.sh` | `/opt/deploybot/deploy-triage-app.sh` (deploybot) |
| `triapp-bascule` | `/usr/local/sbin/triapp-bascule` (root:root, 0755) |
| `triage-app@.service` | `/etc/systemd/system/triage-app@.service` |
| `nginx-triapp.fr.conf` | `/etc/nginx/sites-available/triapp.fr` |
| `nginx-triapp-upstream.conf` | `/etc/nginx/conf.d/triapp-upstream.conf` (réécrit à chaque déploiement) |
| `sudoers-deploybot` | `/etc/sudoers.d/deploybot` |

Les variables d'environnement ne sont plus décrites ici : le fichier `.env.example`
à la racine du dépôt fait foi, commentaire par commentaire, et sert aussi bien au
développement local qu'à la production.

## Architecture

- Next.js servi par **systemd**, deux instances du template `triage-app@.service`
  nommées par leur port : `triage-app@3002` et `triage-app@3003`. Une seule sert le
  trafic à un instant donné. (Les voisins : of-qualiopi=3000, Académie=3001.)
- Chaque couleur sert son propre répertoire de build : `.next-3002` / `.next-3003`.
- Nginx `proxy_pass http://triapp_app`, upstream défini dans
  `/etc/nginx/conf.d/triapp-upstream.conf` — c'est ce fichier qui désigne la couleur
  en service. SSL Let's Encrypt (certbot).
- Déploiement automatique : push sur `main` → webhook GitHub → `deploy-triage-app.sh`.

## Le déploiement, pas à pas

Depuis le 15/08/2026, la bascule est **bleu/vert** et ne coupe plus le service. Avant, un
`systemctl restart` sur l'instance unique servait des 502 aux visiteurs pendant une à deux
minutes à chaque déploiement.

1. Lecture de la couleur en service dans `triapp-upstream.conf` ; la cible est l'autre port.
2. `git pull`, `npm ci --ignore-scripts`, `prisma migrate deploy`.
3. Build dans le répertoire de la couleur cible. **L'instance en service n'est pas touchée** :
   un build qui échoue laisse la production intacte, sans intervention.
4. Démarrage de l'instance cible, puis attente de `GET /api/health` en 200 (180 s au plus).
   Pas de réponse → la cible est arrêtée, la production reste où elle est, le script sort en erreur.
5. Bascule de l'upstream nginx vers la cible, `nginx -t`, `systemctl reload nginx` (gracieux :
   les workers en place terminent leurs requêtes).
6. Drain de 20 s, puis arrêt de l'ancienne couleur.

Les gestes privilégiés de l'étape 4 à 6 passent par `/usr/local/sbin/triapp-bascule`, ouvert à
`deploybot` par six entrées sudo littérales. Le compte de déploiement ne reçoit ni le droit
d'écrire dans `/etc/nginx`, ni celui de piloter systemd librement.

## Vérifier un déploiement

`https://triapp.fr/fr` en 200 ne prouve rien à lui seul — l'ancien build répond aussi.

```bash
ssh -i ~/.ssh/id_semawe_vps2 debian@145.239.55.58 'cd /home/debian/triage-app && git log --oneline -1'
ssh -i ~/.ssh/id_semawe_vps2 debian@145.239.55.58 'tail -5 /var/log/deploybot/deploy-triage-app.log'
ssh -i ~/.ssh/id_semawe_vps2 debian@145.239.55.58 'grep -o "127.0.0.1:[0-9]*" /etc/nginx/conf.d/triapp-upstream.conf'
```

Le journal se termine par `=== Deploy OK (en service sur <port>) ===`, et la couleur lue dans
l'upstream doit avoir changé.

**Ne pas enchaîner deux merges rapprochés** : deux webhooks qui se chevauchent lancent deux
`npm ci` sur le même `node_modules` et la compilation meurt sur un module fantôme. Laisser le
journal afficher `Deploy OK` avant de merger le suivant.

**Le lockfile se génère avec npm 10, jamais avec npm 11** — le VPS tourne sous npm 10.9.8 et
`npm ci` refuse un lockfile réécrit par npm 11. Utiliser `npx npm@10.9.8 install` / `ci`.

## Première mise en prod (historique, à faire une seule fois)

```bash
cd /home/debian
git clone https://github.com/semawe/triage-app.git triage-app
cd triage-app
cp .env.example .env.local                # puis renseigner les vraies valeurs
psql -U postgres -c "CREATE DATABASE triageapp_prod;"
npm ci --ignore-scripts
npx prisma migrate deploy
NEXT_DIST_DIR=.next-3002 npm run build
```

Puis, en root : poser `triage-app@.service`, `triapp-bascule`, les deux fichiers nginx et la
règle sudoers depuis ce dossier, `systemctl daemon-reload`, `systemctl enable --now triage-app@3002`,
`nginx -t && systemctl reload nginx`, `certbot --nginx -d triapp.fr -d www.triapp.fr`.

### Webhook GitHub

Sur GitHub → `semawe/triage-app` → Settings → Webhooks :

- Payload URL : `https://of.semawe.fr/hooks/deploy-triage-app`
- Content type : `application/json`
- Secret : le contenu de `/home/debian/.webhook-secret` (même secret que of-qualiopi)
- Events : `push`

### Stripe webhook prod

Sur dashboard.stripe.com (mode Live) → Developers → Webhooks → Add endpoint :

- URL : `https://triapp.fr/api/stripe/webhook`
- Events : `checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted`, `invoice.payment_failed`
- Copier le signing secret → `.env.local` → `STRIPE_WEBHOOK_SECRET`

## Journaux

```bash
tail -f /var/log/deploybot/deploy-triage-app.log        # déploiements (lisible sans sudo)
journalctl -u triage-app@3002 -f                        # l'application, couleur par couleur
```
