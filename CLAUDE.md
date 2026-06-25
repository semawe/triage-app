# CLAUDE.md — triage-app

App web de facilitation du triage Holacracy (et réunions collaboratives en général).
Open source, licence AGPL-3.0. Repo GitHub public : `semawe/triage-app`.
Projet porté par **Heterostasia** (société en voie de création).
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
- **Stripe** — abonnement par siège (2 €/utilisateur/mois), `src/lib/stripe.ts` + webhook `src/app/api/stripe/webhook/route.ts`
- **nodemailer** (SMTP) — invitations et comptes-rendus email, `src/lib/email.ts`
- **Server-Sent Events** (temps réel) ✅ — broker in-process `src/lib/sse.ts` (mono-instance PM2), route `src/app/api/events/[meetingId]/route.ts`
- **Déploiement** : VPS OVH, PM2 + Nginx (même instance que of-qualiopi)

## Schéma de données (Prisma)

```
Organisation          (id, name, slug, logoUrl?, primaryColor?, features: Json,
                       allowedEmailDomain?, stripeCustomerId?, stripeSubId?,
                       subscriptionStatus: trial|active|past_due|canceled, seatCount, trialEndsAt?)
User                  (id, email, name, image)
OrganisationMember    (org_id, user_id, role: admin|member)
SuperAdmin            (user_id)  — admin plateforme, voir /admin
Space                 (id, org_id, parentId?, name, type: circle|project|instance,
                       purpose?, domains[], accountabilities[], isPrivate)
SpaceMember           (space_id, user_id, role: lead|member)
Role                  (id, space_id, name, purpose?, domains[], accountabilities[])
RoleAssignment        (id, role_id, user_id, startDate, endDate?)
Meeting               (id, space_id, title?, link?, date, durationMinutes?, openedAt?,
                       isPrivate?, status: draft|open|closed)
AgendaItem            (id, meeting_id, author_id, title, order, status: pending|active|done)
Output                (id, item_id, type: note|action|decision|project|governance, content,
                       assignee_id, due_date, isDone)
PendingInvite         (id, org_id, role, token, expiresAt)
JoinRequest           (id, user_id, org_id, status: pending|approved|rejected)
```

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
  lib/features.ts       # Feature flags par org (FeatureKey, hasFeature)
  lib/email.ts          # Envoi SMTP (nodemailer)
  lib/sse.ts            # Broker SSE in-process (subscribe/unsubscribe/broadcast)
  actions/org.ts        # createOrg, switchOrg, updateOrgBranding/Domain/Feature
  actions/meeting.ts    # CRUD réunion + facilitation — toutes gardées par requireMeetingAccess()
  actions/output.ts     # addOutput, toggleOutputDone — gardés par requireMeetingAccess()
  actions/space.ts      # createSpace, deleteSpace, updateSpacePrivacy
  actions/member.ts     # membres org + invitations (token/email) + membres d'espace
  actions/governance.ts # rôles, attributions, purpose/domains/accountabilities (canManageSpace)
  actions/join.ts       # requestJoin / approve / reject (auto-join par domaine)
  actions/billing.ts    # Stripe checkout, portail client, sièges
  actions/admin.ts      # super-admin plateforme (gardé par requireSuperAdmin)
  actions/email.ts      # sendMeetingRecap (compte-rendu aux membres)
  i18n/*                # routing, navigation, request (next-intl, fr/en)
  proxy.ts              # next-intl middleware (remplace middleware.ts, convention Next.js 16)
  app/api/
    auth/[...nextauth]  # handlers NextAuth
    stripe/webhook      # webhook Stripe (signature vérifiée)
    events/[meetingId]  # flux SSE
  app/[locale]/         # layout, login, setup, meetings (+[id], projector), spaces (+[id]),
                        # circles, members, projects, actions, settings, billing-wall,
                        # join-request, invite/[token], admin (+org/[orgId]), mentions-legales
  components/           # AppShell, NavBar
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
- **Reste à faire** (constats d'audit du 25/06, tâches Notion projet) : tests + CI, auth de la route SSE, `.env.example`, factorisation des gardes, uniformisation des erreurs. Phase synchro (indicateurs, check-in tactique) : post-V1.

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

Migration : `npx prisma migrate dev --name <nom>`

## Autonomie

Périmètre standard Claude Code (§5 CLAUDE.md racine).
Validation requise pour : config infra VPS (Nginx, Docker, cron serveur), clés OAuth en production.

## Conventions

- Commits en français ou en anglais (cohérent par session)
- Pas de `console.log` laissés en prod
- Variables d'environnement dans `.env.local` (gitignorée) — jamais en clair dans le code
- Prisma migrations : toujours via `prisma migrate dev`, **jamais `db push`, même en dev** (un `db push` non enregistré a fait dériver la base de l'historique — réconcilié manuellement le 25/06/2026)
