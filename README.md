# Triage App

Application web de facilitation de réunion : agenda collaboratif, traitement des
points un par un, les six pistes du triage Holacracy en panneau rétractable, et
enregistrement des sorties (note, action, décision, projet, gouvernance).

Multi-organisations, espaces cloisonnés (cercles ou projets), phase de synchro
optionnelle (indicateurs, checklists, projets), temps réel par Server-Sent Events,
interface bilingue français / anglais.

Conçue pour les organisations en Holacratie, utilisable par toute équipe qui
anime des réunions à ordre du jour vivant.

- Instance publique : <https://triapp.fr>
- Licence : [AGPL-3.0](LICENSE)

## Sommaire

- [Prérequis](#prérequis)
- [Installation depuis un clone neuf](#installation-depuis-un-clone-neuf)
- [Variables d'environnement](#variables-denvironnement)
- [Tests](#tests)
- [Mise en production](#mise-en-production)
- [Vérifier que ça tourne](#vérifier-que-ça-tourne)
- [Modules optionnels](#modules-optionnels)
- [Architecture du code](#architecture-du-code)
- [Contribuer](#contribuer)

## Prérequis

| | Version | Note |
| --- | --- | --- |
| Node.js | 22 ou plus | testé sous 22 (production) et 24 (développement) |
| npm | 10.9.8 ou plus | voir la réserve dans [Contribuer](#contribuer) |
| PostgreSQL | 16 ou plus | une base dédiée, vide |
| Client OAuth Google | — | seul mode de connexion, voir plus bas |

L'application n'a pas d'autre dépendance de service : ni Redis, ni file de
messages, ni stockage objet.

## Installation depuis un clone neuf

Les six commandes ci-dessous partent d'une machine où rien n'est installé pour
ce projet, et s'arrêtent sur une application qui répond.

### 1. Cloner et installer les dépendances

```bash
git clone https://github.com/semawe/triage-app.git
cd triage-app
npm ci --ignore-scripts
```

`--ignore-scripts` évite que Prisma tente de générer son client avant que la
base soit connue ; la génération a lieu à l'étape 4.

### 2. Créer la base de données

```bash
createdb triageapp
```

Ou, sans les outils clients de PostgreSQL dans le PATH :

```bash
psql -U postgres -c "CREATE DATABASE triageapp;"
```

### 3. Renseigner les variables d'environnement

```bash
cp .env.example .env.local
```

Puis ouvrir `.env.local` et renseigner au minimum `DATABASE_URL`, `AUTH_SECRET`,
`AUTH_URL`, `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET`. Chaque variable est
commentée dans le fichier : à quoi elle sert, si elle est obligatoire, et ce que
le code fait en son absence.

Pour `AUTH_SECRET` :

```bash
openssl rand -base64 32
```

Pour les identifiants Google, créer un ID client OAuth de type « Application
Web » sur [console.cloud.google.com](https://console.cloud.google.com/apis/credentials),
avec pour URI de redirection autorisé :

```
http://localhost:3000/api/auth/callback/google
```

En production, remplacer `http://localhost:3000` par la valeur d'`AUTH_URL`.

### 4. Générer le client Prisma et appliquer les migrations

```bash
npx prisma generate
npx prisma migrate deploy
```

Le client Prisma est généré dans `src/generated/prisma`, qui n'est pas versionné :
un clone neuf ne compile pas tant que `prisma generate` n'a pas tourné.

`migrate deploy` applique les migrations existantes sans en créer. Pour faire
évoluer le schéma en développement, c'est `npx prisma migrate dev --name <nom>`
qu'il faut employer — jamais `db push`, qui fait dériver la base de l'historique
des migrations.

### 5. Lancer en développement

```bash
npm run dev
```

L'application répond sur <http://localhost:3000>, qui redirige vers la locale par
défaut, <http://localhost:3000/fr>.

### 6. Créer la première organisation

Se connecter avec un compte Google : l'application propose alors de créer une
organisation, et le compte qui la crée en devient administrateur. Rien à insérer
en base à la main.

Pour se donner en plus les droits de super-administrateur de la plateforme
(console `/admin`, qui donne la vue sur toutes les organisations), insérer une
ligne après s'être connecté au moins une fois :

```bash
psql "$DATABASE_URL" -c \
  "INSERT INTO \"SuperAdmin\" (id, \"userId\") \
   SELECT gen_random_uuid()::text, id FROM \"User\" WHERE email = 'vous@example.org';"
```

## Variables d'environnement

Le fichier [`.env.example`](.env.example) fait foi : il recense toutes les
variables lues par le code, avec leur rôle et leur caractère obligatoire ou non.
En résumé :

| Variable | Obligatoire | Rôle |
| --- | --- | --- |
| `DATABASE_URL` | oui | connexion PostgreSQL (migrations et runtime) |
| `AUTH_SECRET` | oui | chiffrement des sessions NextAuth |
| `AUTH_URL` | oui | URL canonique ; sert aussi aux liens d'invitation envoyés par e-mail |
| `GOOGLE_CLIENT_ID` | oui | seul fournisseur d'authentification |
| `GOOGLE_CLIENT_SECRET` | oui | idem |
| `AUTH_TRUST_HOST` | derrière un proxy | fait confiance aux en-têtes `X-Forwarded-*` |
| `NEXT_PUBLIC_APP_URL` | si Stripe | base des URL de retour après paiement |
| `STRIPE_SECRET_KEY` | non | active la facturation par siège |
| `STRIPE_WEBHOOK_SECRET` | si Stripe | signature des événements entrants |
| `BREVO_SMTP_USER` | non | relais SMTP des invitations et comptes-rendus |
| `BREVO_SMTP_PASSWORD` | non | idem ; vide, l'envoi d'e-mail est désactivé proprement |
| `EMAIL_FROM` | non | adresse expéditrice |
| `NEXT_DIST_DIR` | non | répertoire de build (déploiement bleu/vert) |
| `SKIP_BUILD_CHECKS` | non | saute le type-check du build sur machine à faible RAM |

Les valeurs vivent dans `.env.local`, qui est gitignoré. Ne jamais écrire de
valeur réelle dans `.env.example`.

## Tests

La suite est faite de tests d'intégration exécutés contre une vraie base
PostgreSQL : les gardes d'autorisation multi-tenant ne se vérifient pas à coups
de mocks. Il faut donc une base de test, distincte de la base de développement.

```bash
createdb triageapp_test
DATABASE_URL="postgresql://user@localhost:5432/triageapp_test" npx prisma migrate deploy
DATABASE_URL="postgresql://user@localhost:5432/triageapp_test" npm test
```

Autres vérifications, celles que la CI exécute sur chaque PR
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) :

```bash
npm run typecheck
npx eslint src tests
```

## Mise en production

L'application est un serveur Next.js standard : elle se construit, puis se lance
sur un port, derrière un reverse proxy qui termine TLS.

```bash
npm ci --ignore-scripts
npx prisma migrate deploy
npm run build          # `prisma generate` inclus
npm start              # écoute sur le port 3000, ou $PORT
```

Points à respecter :

- **`AUTH_URL` et `NEXT_PUBLIC_APP_URL`** portent l'URL publique en `https://`,
  sans barre oblique finale, et l'URI de redirection Google doit correspondre.
- **`AUTH_TRUST_HOST=true`** derrière un reverse proxy, faute de quoi les
  redirections OAuth repartent sur l'hôte interne.
- **`prisma migrate deploy` avant le build**, jamais `migrate dev` en production.
- **Le temps réel est mono-instance.** Le diffuseur SSE (`src/lib/sse.ts`) vit
  dans la mémoire du processus : deux instances derrière un répartiteur de
  charge ne se transmettent pas les événements. Pour monter en charge, il faut
  d'abord remplacer ce diffuseur par un canal partagé.
- **`next build` est gourmand en mémoire.** Sur une machine à moins de 2 Go, il
  faut du swap ; en dernier recours, `SKIP_BUILD_CHECKS=1` après un
  `npm run typecheck` passé en amont.

Le dossier [`deploy/`](deploy/) contient l'installation réelle de
<https://triapp.fr> : unité systemd, configuration Nginx, script de déploiement
bleu/vert sans coupure de service. C'est un exemple fonctionnel, à adapter, pas
une exigence.

## Vérifier que ça tourne

Dans cet ordre — une page qui répond 200 ne prouve pas à elle seule que la bonne
version tourne, ni que la base est joignable.

```bash
# 1. Le processus sert des requêtes (aucun accès à la base dans cette sonde)
curl -fsS http://localhost:3000/api/health
# → {"status":"ok"}

# 2. L'application rend ses pages
curl -o /dev/null -w '%{http_code}\n' http://localhost:3000/fr
# → 200

# 3. La base est bien migrée
npx prisma migrate status
# → « Database schema is up to date! »
```

Puis, dans un navigateur, ouvrir `/fr` et se connecter : un bouton de connexion
Google qui mène jusqu'au retour sur l'application valide toute la chaîne
(variables, base, session, OAuth).

## Modules optionnels

Aucun n'est nécessaire pour faire tourner l'application.

**Facturation Stripe.** Renseigner `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
et `NEXT_PUBLIC_APP_URL`, puis déclarer un endpoint webhook vers
`<NEXT_PUBLIC_APP_URL>/api/stripe/webhook` abonné à `checkout.session.completed`,
`customer.subscription.updated`, `customer.subscription.deleted` et
`invoice.payment_failed`. La TVA est calculée par Stripe Tax, à activer côté
compte Stripe. Sans clé, l'application démarre et fonctionne : seules les actions
de facturation lèvent une erreur.

**E-mails.** Invitations et comptes-rendus passent par le relais SMTP de Brevo,
dont l'hôte est en dur dans `src/lib/email.ts`. Sans `BREVO_SMTP_PASSWORD`,
l'envoi est désactivé proprement et le reste du produit fonctionne ; les liens
d'invitation restent copiables depuis l'interface. Un autre relais SMTP demande
de modifier ce fichier.

## Architecture du code

```
src/
  actions/      Server Actions — toutes les mutations passent par là
  app/          App Router : [locale]/ pour les pages, api/ pour les 4 routes
  components/   AppShell, navigation, palette de commandes
  i18n/         routage next-intl (fr, en)
  lib/          auth, prisma, session (gardes d'autorisation), stripe, email, sse
messages/       traductions fr.json et en.json
prisma/         schéma et migrations
tests/          tests d'intégration Vitest
deploy/         miroir de l'installation de triapp.fr
```

Quelques partis pris qui expliquent le reste :

- **Server Actions plutôt qu'API REST.** Quatre routes HTTP seulement :
  NextAuth, webhook Stripe, flux SSE, sonde de santé.
- **Autorisation revérifiée à chaque mutation.** Un identifiant reçu du client
  n'est jamais tenu pour appartenant à l'organisation de l'appelant : les gardes
  de `src/lib/session.ts` et `src/lib/authz.ts` le revérifient. Toute
  contribution touchant à une action de mutation doit conserver cette propriété.
- **Prisma v7 avec l'adaptateur `@prisma/adapter-pg`**, client généré dans
  `src/generated/prisma` (non versionné).
- **Next.js 16, App Router.** `params` est une `Promise` : `const { id } = await params`.

## Contribuer

Les issues et pull requests sont les bienvenues sur
<https://github.com/semawe/triage-app>.

Avant d'ouvrir une PR :

```bash
npm run typecheck
npx eslint src tests
npm test          # avec DATABASE_URL vers la base de test
```

Une correction de sécurité s'accompagne du test qui échoue sans elle.

**Réserve sur npm.** Le lockfile est maintenu sous **npm 10.9.8**. Un
`package-lock.json` réécrit par npm 11 est refusé par `npm ci` sous npm 10, ce
qui casse la chaîne de déploiement sans que rien ne le signale. Toute
modification de dépendances passe donc par :

```bash
npx npm@10.9.8 install <paquet>
npx npm@10.9.8 ci --ignore-scripts   # la vérification qui compte
```

Installer les dépendances sans toucher au lockfile (`npm ci`) fonctionne en
revanche avec n'importe quelle version de npm à partir de la 10.

## Licence

GNU Affero General Public License v3.0 — voir [LICENSE](LICENSE).

Le service est édité par Heterostasia (SAS, RCS Grenoble 108 072 919).
Mentions légales : <https://triapp.fr/fr/mentions-legales>.
