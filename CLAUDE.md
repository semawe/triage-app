# CLAUDE.md — triage-app

App web de facilitation du triage Holacracy (et réunions collaboratives en général).
Open source, licence AGPL-3.0. Repo GitHub public : `semawe/triage-app`.
Projet porté par **Heterostasia** (SAS, RCS Grenoble 108 072 919, immatriculée le
31/07/2026 — éditrice déclarée du service dans les mentions légales depuis cette date,
en remplacement de La Fabrique des Alpes).
Domaine de déploiement : **triapp.fr** (réservé sur OVH, compte La Fabrique des Alpes).

## Contexte produit

Outil de facilitation de réunion : agenda collaboratif, traitement des points un par un,
6 pistes du triage Holacracy en panneau rétractable, enregistrement des outputs
(note / action / décision / projet / gouvernance).

Multi-organisations, espaces cloisonnés (cercles ou projets), export Notion et Google Drive.
Phase synchro (indicateurs, check-in tactique) : post-V1.

Cible : organisations Holacracy et non-Holacracy, distribué librement.

## Stack

- **Next.js 16.2.9** (App Router, RSC, Turbopack) — `params` est une `Promise<{...}>`
- **PostgreSQL** local dev via Postgres.app v2.9.5 (`aliocha@localhost:5432/triageapp`) ; prod sur VPS OVH
- **Prisma v7** avec `@prisma/adapter-pg` (PrismaPg) — `src/lib/prisma.ts`
- **NextAuth.js v5 beta** (`next-auth@beta`) — Google OAuth uniquement en V1, `src/lib/auth.ts`
- **next-intl v4** — routing `/[locale]/`, fichiers `messages/fr.json` et `messages/en.json` ; proxy `src/proxy.ts` (remplace `middleware.ts`)
- **Tailwind CSS** (pas shadcn pour l'instant)
- **Server Actions** pour toutes les mutations (pas d'API REST), sauf 3 routes : auth NextAuth, webhook Stripe, flux SSE
- **Stripe** — abonnement par siège (2 € HT/utilisateur/mois → 2,40 € TTC, TVA via `STRIPE_TAX_RATE_ID` ; tarif asso via code promo `ASSO`, voir § Facturation), `src/lib/stripe.ts` + webhook `src/app/api/stripe/webhook/route.ts`
- **nodemailer** (SMTP) — invitations et comptes-rendus email, `src/lib/email.ts`
- **Server-Sent Events** (temps réel) ✅ — broker in-process `src/lib/sse.ts` (mono-instance PM2), route `src/app/api/events/[meetingId]/route.ts`
- **Déploiement** : VPS OVH, systemd (`triage-app.service`) + Nginx (même instance que of-qualiopi) — PM2 abandonné le 09/08/2026, cf. § Déploiement

## Schéma de données (Prisma)

```
Organisation          (id, name, slug, logoUrl?, primaryColor?, features: Json,
                       allowedEmailDomain?, stripeCustomerId?, stripeSubId?,
                       subscriptionStatus: trial|active|past_due|canceled, seatCount, trialEndsAt?)
User                  (id, email, name, image)
OrganisationMember    (org_id, user_id, role: admin|member)
SuperAdmin            (user_id)  — admin plateforme, voir /admin
Space                 (id, org_id, parentId?, name, type: circle|project|instance,
                       purpose?, strategy?, domains[], accountabilities[], isPrivate)
SpaceMember           (space_id, user_id, role: lead|member)
Role                  (id, space_id, name, purpose?, domains[], accountabilities[])
RoleAssignment        (id, role_id, user_id, startDate, endDate?)
Policy                (id, space_id, title, body)  — règle de gouvernance rattachée à un cercle
Meeting               (id, space_id, title?, link?, date, durationMinutes?, openedAt?,
                       isPrivate?, status: draft|open|closed)
AgendaItem            (id, meeting_id, author_id, title, order, status: pending|active|done)
Output                (id, item_id, type: note|action|decision|project|governance, content,
                       assignee_id, due_date, isDone)
Indicator             (id, space_id, name, unit?, frequency?, order)  — cockpit du cercle
IndicatorValue        (id, indicator_id, meeting_id, author_id, value, note?, recordedAt)
                      — un relevé par (indicateur, réunion), upsert ; historisé
ChecklistItem         (id, space_id, title, order)  — checklist récurrente du cercle
ChecklistCheck        (id, item_id, meeting_id, isDone, checkedBy?, checkedAt?)
                      — coche par réunion ; pas de ligne = non coché (vierge à chaque réunion)
Project               (id, space_id, name, description?, status: active|on_hold|done)
ProjectTask           (id, project_id, title, status: todo|doing|done, assignee_id?,
                       due_date?, order)  — Kanban des tâches d'un projet (/projects/[id])
PendingInvite         (id, org_id, role, token, expiresAt)
JoinRequest           (id, user_id, org_id, status: pending|approved|rejected)
```

Vocabulaire (retour Aliocha 07/07) : « **cockpit** » = les éléments du cercle
(indicateurs, checklists, projets — onglet Cockpit d'un cercle) ; « **phase de
synchro** » = le moment de la réunion tactique où on relève le cockpit, avant
le triage. `Meeting.syncCompletedAt` gate le triage quand le module `sync_phase`
est actif (flag org + override par espace via `Space.features`, résolution
espace > org > défaut dans `hasFeature(org, key, space?)`).

Index FK explicites (migration `add_fk_indexes`) sur les chemins chauds :
`OrganisationMember.userId`, `Space.organisationId`, `Meeting.spaceId`,
`AgendaItem.meetingId`, `Output.itemId`.

## Architecture — fichiers clés

```
src/
  lib/auth.ts           # NextAuth v5 config (Google OAuth, PrismaAdapter)
  lib/prisma.ts         # Singleton PrismaClient avec PrismaPg adapter
  lib/session.ts        # requireAuth() / requireOrg() / requireMeetingAccess() /
                        # requireSuperAdmin() / isSuperAdmin() — gardes d'autorisation
  lib/stripe.ts         # Client Stripe lazy + isOrgAccessible() (trial/active)
  lib/features.ts       # Feature flags par org + override par espace (hasFeature(org, key, space?))
  lib/authz.ts          # canManageSpace() — admin org OU lead d'espace (gouvernance + cockpit)
  lib/email.ts          # Envoi SMTP (nodemailer)
  lib/sse.ts            # Broker SSE in-process (subscribe/unsubscribe/broadcast)
  actions/org.ts        # createOrg, switchOrg, updateOrgBranding/Domain/Feature
  actions/meeting.ts    # CRUD réunion + facilitation + completeSyncPhase — gardés par requireMeetingAccess()
  actions/output.ts     # addOutput, toggleOutputDone — gardés par requireMeetingAccess()
  actions/space.ts      # createSpace (admin ou lead du parent), deleteSpace (admin,
                        # bloqué si enfants/rôles/réunions), updateSpacePrivacy, updateSpaceFeature
  actions/member.ts     # membres org + invitations (token/email) + membres d'espace
  actions/governance.ts # rôles, attributions, purpose/domains/accountabilities (canManageSpace)
  actions/indicator.ts  # CRUD indicateurs (canManageSpace) + logIndicatorValue (participants)
  actions/checklist.ts  # CRUD checklist (canManageSpace) + toggleChecklistCheck (participants)
  actions/project.ts    # CRUD projets (canManageSpace) — Kanban /projects
  actions/projectTask.ts # CRUD tâches de projet (canManageSpace) — Kanban /projects/[id]
  actions/join.ts       # requestJoin / approve / reject (auto-join par domaine)
  actions/billing.ts    # Stripe checkout, portail client, sièges
  actions/admin.ts      # super-admin plateforme (gardé par requireSuperAdmin)
  actions/email.ts      # sendMeetingRecap (compte-rendu aux membres)
  actions/search.ts     # searchOrg — recherche transverse (cercles, rôles, membres,
                        # réunions avec filtre de confidentialité) pour la palette Cmd+K
  i18n/*                # routing, navigation, request (next-intl, fr/en)
  proxy.ts              # next-intl middleware (remplace middleware.ts, convention Next.js 16)
  app/api/
    auth/[...nextauth]  # handlers NextAuth
    stripe/webhook      # webhook Stripe (signature vérifiée)
    events/[meetingId]  # flux SSE
  app/[locale]/         # layout, login, setup, me (accueil personnel), meetings (+[id],
                        # projector), circles (+[id] — page canonique d'un cercle),
                        # members, projects (+[id]), actions, settings, billing-wall,
                        # join-request, invite/[token], admin (+org/[orgId]), mentions-legales
                        # NB : spaces et spaces/[id] = simples redirections vers circles
  components/           # AppShell, NavBar, CommandPalette (Cmd+K)
messages/fr.json, en.json
prisma/schema.prisma    # Schéma complet (voir section ci-dessus)
```

## Notes techniques importantes

- **`params` comme Promise** : `const { id } = await params` dans les page components (Next.js 16)
- **`datetime-local` → Date locale** : `parseDatetimeLocal()` dans `actions/meeting.ts` pour éviter le décalage UTC
- **jump-to-item** : `updateMany` active→pending puis `update` cible→active (préserve le retour en arrière)
- **Avatars auteur** : Google OAuth fournit `image` URL dans la session ; fallback initiales
- **Chrono** : client component avec `setInterval`, rouge+pulse quand dépassé, orange sous 5 min
- **Autorisation (multi-tenant)** : toute Server Action de mutation vérifie l'appartenance à l'organisation de la ressource — jamais seulement la session. Réunions/outputs → `requireMeetingAccess(meetingId)` (autorise sur l'org de la réunion, pas l'org active du cookie) ; espaces/membres → `requireOrg()` + contrôle `organisationId === org.id` + rôle ; gouvernance → `canManageSpace()` ; plateforme → `requireSuperAdmin()`. Ne jamais faire confiance à un id reçu du client sans revérifier son rattachement à l'org de l'appelant.

## Roadmap

- **Phase 0** ✅ : Fondations — repo, schéma Prisma, auth Google, dark mode, i18n fr/en
- **Phase 1** ✅ : Triage V1 — onboarding org, agenda, facilitation, 6 pistes GTD, outputs
- **Phase 2** ✅ : Améliorations facilitation — chrono, jump-to-item, avatars, pistes Holacracy, programmation avancée ; UI mobile + PWA ; Stripe Billing (abonnement par siège) ; super-admin plateforme
- **Phase 3** ✅ : Espaces/Rôles — cercles/projets/instances, hiérarchie, rôles + attributions, membres d'espace, confidentialité ; invitations (token/email), auto-join par domaine, demandes d'adhésion ; compte-rendu email
- **Phase 4** 🔶 : Temps réel (SSE) ✅ ; Export Notion + Google Drive — à faire
- **Phase synchro** ✅ (07/07) : module `sync_phase` opt-in — revue du cockpit (indicateurs historisés, checklists recochées par réunion, projets) avant le triage ; actions `indicator.ts`/`checklist.ts`/`project.ts`, garde partagée `src/lib/authz.ts` (canManageSpace)
- **Projets** ✅ (07-10/07) : entité Project + Kanban `/projects` (3 colonnes par statut, filtre par espace, création directe) ; ProjectTask + Kanban des tâches `/projects/[id]` ; migration des anciens outputs « project » en cartes
- **Refonte navigation** ✅ (07-10/07, PR #7) : fusion Espaces→Cercles — `/circles/[id]` page canonique d'un cercle (fil d'Ariane complet, onglets Aperçu/Gouvernance/Réunions/Membres/Cockpit), carte SVG = navigation principale (1ᵉʳ clic = panneau de détail, 2ᵉ clic = entrer, clic membrane = remonter), sélection adressable (`?circle=`/`?role=` — un rôle a une URL partageable), palette Cmd+K (`CommandPalette` + `actions/search.ts`), accueil personnel `/me` (rôles, cercles, actions, réunions — page d'atterrissage), bottom nav mobile avec feuille « Plus », nav i18n fr/en ; flag `circle_view` supprimé (la carte est devenue le socle)
- **Durcissement sécurité** ✅ (10/08, revue adverse) : cloisonnement effectif des espaces privés (`src/lib/visibility.ts`), autorisation du compte-rendu, sièges et mur de facturation, webhook Stripe idempotent, jetons CSPRNG et invitations nominatives, route SSE authentifiée, transitions d'agenda transactionnelles ; suite de tests Vitest + CI GitHub Actions
- **Reste à faire** : `.env.example`, uniformisation des erreurs.

## Base de données — dev

**Local (Mac)** : Postgres.app v2.9.5, base `triageapp`, user `aliocha` (pas de mot de passe, socket Unix).
```
DATABASE_URL="postgresql://aliocha@localhost:5432/triageapp"
```

**VPS OVH** (prod à venir) : voir les accès dans Notion — même instance que of-qualiopi.
Connexion locale via tunnel SSH :
```bash
ssh -N -L 15432:localhost:5432 -i ~/.ssh/<your-key> <user>@<vps-ip> &
```
Note : le réseau domicile peut bloquer ce tunnel — utiliser un hotspot ou VPN si nécessaire.
Pour **lire** la base de prod, ne pas passer par là : utiliser le rôle en lecture seule `triageapp_prod_lecture` (§ Déploiement).

Migration : `npx prisma migrate dev --name <nom>`

## Déploiement (prod)

- **VPS OVH** `debian@145.239.55.58` (box `semawe-prod-gra11`, même instance que of-qualiopi), `ssh -i ~/.ssh/id_semawe_vps2`. App dans `/home/debian/triage-app`, base PostgreSQL locale `triageapp_prod`, service **systemd `triage-app.service`** (port 3002, **bindé 127.0.0.1**) — **plus PM2** depuis le durcissement du 09/08/2026 : `pm2 list` sous `debian` ne renvoie rien, ce n'est pas un incident. Drop-in `/etc/systemd/system/triage-app.service.d/durcissement-a5.conf` (action A5 de l'audit du 03/08) : `MemoryMax=768M`, `CPUQuota=80%`, `NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=full`, familles d'adresses restreintes ; `ProtectHome` en est volontairement absent, le code vivant sous `/home/debian`. Nginx → triapp.fr, SSL Let's Encrypt. (Ancienne box `51.178.234.59` compromise et supprimée le 28/06/2026 — incident SEC-21 ; reconstruction propre + durcissement : egress UFW deny outgoing, vps-watch, fail2ban.)
- **Auto-déploiement par webhook** : tout push sur `main` déclenche `webhook-server.js` (sous l'identité `deploybot`) → **`/opt/deploybot/deploy-triage-app.sh`** : `sudo -u triageapp bash -lc '…'` enchaîne `git pull origin main` → `npm ci --ignore-scripts` → `prisma migrate deploy` → build atomique (`NEXT_DIST_DIR=.next-build`, puis `mv .next .next.old && mv .next-build .next`), et le script termine par `sudo systemctl restart triage-app`. **Pas besoin de SSH pour déployer**, mais c'est `migrate deploy` (pas `dev`) qui tourne en prod. `deploy/deploy-triage-app.sh` dans le repo n'est qu'un **miroir** de la copie serveur, qui seule s'exécute : il avait dérivé entre le 25/06 et le 10/08/2026 sans que la prod bronche — le réaligner à chaque modification, dans les deux sens. `.next.old` (~67 Mo) est créé par le script à chaque déploiement, ce n'est pas un résidu à nettoyer.
- **Quand la prod ne bouge plus alors que `main` avance** — arrivé deux fois le 10/08/2026, et invisible côté site (il continue de répondre 200 sur l'ancien build). Le journal `/var/log/deploybot/deploy-triage-app.log` est **lisible sans sudo** et donne la cause en clair. Les deux causes déjà rencontrées : (1) `error: Your local changes to the following files would be overwritten by merge: package-lock.json` — le `git pull` avorte, souvent sans que le contenu diffère réellement de `HEAD` (comparer `git hash-object package-lock.json` et `git rev-parse HEAD:package-lock.json`), la réparation demande d'écrire dans le checkout, donc les droits d'Aliocha ; (2) `sudo: The "no new privileges" flag is set` — un drop-in de durcissement posé sur le service du webhook empêchait `sudo` dans le script. Vérifier en premier que le git du serveur est bien à la tête de `main` : `ssh -i ~/.ssh/id_semawe_vps2 debian@145.239.55.58 'cd /home/debian/triage-app && git log --oneline -1'`.
- **⚠️ Le lockfile se génère avec npm 10, jamais avec npm 11.** Le VPS et la CI tournent sous Node 22 / **npm 10.9.8** ; un `package-lock.json` réécrit par npm 11 est **refusé par `npm ci`** (EUSAGE, paquets absents du lockfile), et comme `npm ci` est la première étape du déploiement, la prod cesse alors de recevoir toute mise à jour — en silence, le site continuant de répondre 200 sur l'ancien build. Diagnostiqué le 10/08/2026 (commit `4491a0f`), puis reproduit le même jour : `npm ci` **réussit** sous npm 11 et échoue sous npm 10, donc une vérification locale en npm 11 ne prouve rien. Toute manipulation de dépendances passe par `npx npm@10.9.8 install` / `npx npm@10.9.8 ci`, et la vérification qui compte est `npx npm@10.9.8 ci --ignore-scripts`.
- **`overrides.nodemailer`** dans `package.json` : nodemailer est tenu en 9.x pour les correctifs d'injection SMTP et d'en-têtes, alors que `next-auth` plafonne sa peer dependency à `^7.0.7 || ^8.0.5` (beta.32 incluse, la dernière publiée). Sans cet `overrides`, `npm ci` casse en ERESOLVE sous npm 10. C'est sûr parce que la peer y est déclarée **optionnelle** et ne sert qu'au provider magic-link, non utilisé (Google OAuth seul) — **à revérifier si le magic-link est activé**.
- **RAM limitée** : `next build` (Turbopack) sature la mémoire. Garde-fou en place : swap de 6 Go (`/swapfile` + `/swapfile_deploy`, dans `/etc/fstab`) — la compilation déborde dessus. Ne pas le retirer sans alternative. (Le `SKIP_BUILD_CHECKS=1` que ce fichier documentait n'existe **pas** dans le script du serveur, vérifié le 10/08/2026 ; le type-check est couvert en amont par la CI GitHub et par `tsc --noEmit` avant push.)
- **Vérif post-deploy** — dans cet ordre, `https://triapp.fr/fr` → 200 ne prouve rien à lui seul (l'ancien build répond aussi) :
  1. `ssh … 'cd /home/debian/triage-app && git log --oneline -1'` = la tête de `main` ;
  2. `ssh … 'tail -5 /var/log/deploybot/deploy-triage-app.log'` se termine par `=== Deploy OK ===` (sinon le déploiement est en cours ou a échoué) ;
  3. `ssh … 'systemctl show -p ActiveEnterTimestamp triage-app'` — redémarrage récent = bascule effective (**pas** `pm2 list`, vide depuis le passage à systemd) ;
  4. `https://triapp.fr/fr` → 200.

  **Un déploiement coupe le service** : `systemctl restart` n'est pas gracieux, contrairement au `pm2 reload --update-env` qu'il a remplacé. Entre la bascule de `.next` et le redémarrage effectif, le site répond **502** — une à deux minutes observées le 10/08/2026, l'arrêt passant par `stop-sigterm` avant `SIGKILL`. Un 502 juste après un merge sur `main` est donc attendu et transitoire ; ne pas le traiter comme un incident avant d'avoir vérifié `systemctl show -p ActiveState -p SubState triage-app` (`deactivating` / `stop-sigterm` = arrêt en cours, laisser finir).
- **Lecture de la base de prod (voie normale pour diagnostiquer)** : rôle PostgreSQL dédié **en lecture seule** `triageapp_prod_lecture` (CONNECT, USAGE, SELECT, plus `ALTER DEFAULT PRIVILEGES` pour que les tables des migrations futures restent lisibles — aucune écriture, volontairement). Son mot de passe vit dans le `~/.pgpass` de `debian` sur la box (mode 600) : `psql` le trouve seul, aucun secret à manipuler.
  ```bash
  ssh -i ~/.ssh/id_semawe_vps2 debian@145.239.55.58 'psql -h 127.0.0.1 -U triageapp_prod_lecture -d triageapp_prod -At -c "SELECT 1"'
  ```
  Pour une requête à guillemets imbriqués, passer le SQL par un fichier et `psql -f -`. Entrée Bitwarden « triage-app — PostgreSQL lecture seule », collection *Infrastructure & API*.
- **Script Node ponctuel en prod** (migration de données, écriture ad hoc) : **`debian` n'a plus de sudo passwordless vers `triageapp`.** Depuis le lot A3 du durcissement du 09/08/2026, l'entrée `(elearning, triageapp, ofqualiopi) NOPASSWD: ALL` a été retirée de `debian` et donnée à l'identité de service `deploybot` (`/etc/sudoers.d/deploybot`), réservée à la chaîne de déploiement. Un `sudo -u triageapp <cmd>` depuis `debian` réclame donc le mot de passe sudo, qui vit dans Bitwarden et relève d'Aliocha : une session Claude ne peut pas exécuter ce genre de script seule — **passer par le rôle de lecture ci-dessus pour tout diagnostic**, et demander à Aliocha pour une écriture. Vérifiable par `ssh -i ~/.ssh/id_semawe_vps2 debian@145.239.55.58 'sudo -n -l'`. Détail et preuves dans `~/dev/apps/erp/docs/deploiement-vps.md` (lots A3 et A4), image de référence des sudoers dans `~/dev/ovh/infra-monitoring/scripts/vps-rebuild/reference-145.239.55.58/`.
  Recette une fois le mot de passe fourni : déposer le script dans `/tmp` (pas besoin d'écrire dans `/home/debian/triage-app`, appartient à `triageapp`), puis `sudo -u triageapp bash -c 'cd /home/debian/triage-app && set -a && source .env.local && set +a && node /tmp/mon-script.js'`. Dans le script, importer le client Prisma et `@prisma/adapter-pg` par chemin absolu vers `/home/debian/triage-app/...` (le script n'a pas son propre `node_modules`). Toujours nettoyer `/tmp` après usage.

## Autonomie

Périmètre standard Claude Code (§5 CLAUDE.md racine).
Validation requise pour : config infra VPS (Nginx, Docker, cron serveur), clés OAuth en production.

## Facturation — TVA et tarif associations

Le prix catalogue est en **HT** (site B2B). Standard : **2 € HT/siège/mois → 2,40 € TTC** (TVA 20 %).

- **TVA** : appliquée via un `TaxRate` Stripe (`inclusive=false`), référencé par la variable d'env `STRIPE_TAX_RATE_ID` et posé sur la ligne de checkout dans `actions/billing.ts`. Sans la variable, l'app facture à plat (pas de TVA). En prod (live) : `STRIPE_TAX_RATE_ID=txr_1TmcyFPYbG48BY68DD9EHdMN` (20 %, FR), dans `/home/debian/triage-app/.env.local`. Réversible en retirant la variable + `pm2 restart`.
- **Tarif associations** : remise commerciale (pas une exonération de TVA — non applicable côté vendeur), via le code promo réutilisable **`ASSO`** (coupon Stripe `lijKoZip`, −16,67 %, `duration=forever`, `promotion_code` `promo_1Tmd2oPYbG48BY68J5sESf3I`). Appliqué au checkout (`allow_promotion_codes: true`), il ramène à **2,00 € TTC** tout compris (2 € HT − 0,33 € = 1,67 € net + 0,33 € TVA). À communiquer aux associations à but non lucratif qui en font la demande.
- **Créer un code promo ponctuel** (cas particulier) : Stripe Dashboard (live) → Products → Coupons, ou API `POST /v1/coupons` (`percent_off`, `duration`) puis `POST /v1/promotion_codes` (`coupon`, `code`). ⚠️ La version d'API par défaut du compte rejette le param `coupon` sur `/v1/promotion_codes` : forcer l'en-tête `Stripe-Version: 2023-10-16`.
- **Décision de prix** (activer la TVA, changer le tarif asso) = validation Aliocha (impact facturation prod).

## Conventions

- Commits en français ou en anglais (cohérent par session)
- Pas de `console.log` laissés en prod
- Variables d'environnement dans `.env.local` (gitignorée) — jamais en clair dans le code
- Prisma migrations : toujours via `prisma migrate dev`, **jamais `db push`, même en dev** (un `db push` non enregistré a fait dériver la base de l'historique — réconcilié manuellement le 25/06/2026)

## Tests

Suite d'intégration Vitest sous `tests/`, exécutée contre une vraie base PostgreSQL
(les gardes d'autorisation ne se testent pas à coups de mocks). `tests/setup.ts`
simule la seule chose indisponible hors requête HTTP : l'identité de l'appelant
(`actAs()`), les cookies, et les fonctions Next qui lèvent (`redirect`, `notFound`).

```bash
createdb triageapp_test && DATABASE_URL="postgresql://aliocha@localhost:5432/triageapp_test" npx prisma migrate deploy
DATABASE_URL="postgresql://aliocha@localhost:5432/triageapp_test" npm test
```

Couverture actuelle — les invariants de sécurité issus de la revue adverse du
10/08/2026 : cloisonnement des espaces et réunions privés, autorisation et
destinataires du compte-rendu, sièges au checkout et mur de facturation, jetons
d'invitation nominatifs et révocation d'invités, invariants sous concurrence.
Toute correction de sécurité s'accompagne du test qui échoue sans elle : la
contre-épreuve (rejouer la suite sur le code d'avant) fait partie du travail.

CI GitHub Actions (`.github/workflows/ci.yml`) : type-check, lint et tests sur
chaque PR et chaque push sur `main`, avec un service PostgreSQL 16.
