# Déploiement — triage-app (triapp.fr)

VPS OVH partagé avec of-qualiopi : `ssh -i ~/.ssh/id_semawe_master debian@51.178.234.59`

## Architecture

- Next.js sur le port **3001** (of-qualiopi occupe le 3000)
- PM2 process name : `triage-app`
- Nginx reverse proxy : triapp.fr → localhost:3001
- SSL Let's Encrypt (certbot)
- Deploy automatique : push sur `main` → webhook GitHub → `deploy-triage-app.sh`

## Première mise en prod (à faire une seule fois)

### 1. Sur le VPS

```bash
ssh -i ~/.ssh/id_semawe_master debian@51.178.234.59

# Cloner le repo
cd /home/debian
git clone https://github.com/semawe/triage-app.git triage-app
cd triage-app

# Variables d'env
cp deploy/.env.local.example .env.local
# Éditer .env.local avec les vraies valeurs prod

# Créer la base PostgreSQL
psql -U postgres -c "CREATE DATABASE triageapp_prod;"

# Migrations initiales
npm ci --ignore-scripts
npx prisma migrate deploy

# Build initial
npm run build

# Démarrer via PM2
pm2 start "npm start -- -p 3001" --name triage-app
pm2 save
```

### 2. Nginx

```bash
sudo cp /home/debian/triage-app/deploy/nginx-triapp.fr.conf /etc/nginx/sites-available/triapp.fr
sudo ln -s /etc/nginx/sites-available/triapp.fr /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# SSL
sudo certbot --nginx -d triapp.fr -d www.triapp.fr
```

### 3. Webhook GitHub → deploy automatique

```bash
# Ajouter la route dans webhook-server.js (voir webhook-server.patch)
# Puis recharger le process webhook
pm2 reload webhook-server   # ou le nom du process PM2 qui tourne webhook-server.js
```

Sur GitHub → `semawe/triage-app` → Settings → Webhooks → Add webhook :
- Payload URL : `https://of.semawe.fr/hooks/deploy-triage-app`
- Content type : `application/json`
- Secret : le contenu de `/home/debian/.webhook-secret` (même secret que of-qualiopi)
- Events : `push`

### 4. Stripe webhook prod

Sur dashboard.stripe.com (mode Live) → Developers → Webhooks → Add endpoint :
- URL : `https://triapp.fr/api/stripe/webhook`
- Events : `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- Copier le signing secret → `.env.local` → `STRIPE_WEBHOOK_SECRET`

## Déployer une mise à jour

```bash
git push origin main  # le webhook se charge du reste
```

## Logs

```bash
ssh -i ~/.ssh/id_semawe_master debian@51.178.234.59
tail -f /home/debian/deploy-triage-app.log
pm2 logs triage-app
```
