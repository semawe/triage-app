# CLAUDE.md — triage-app

App web de facilitation du triage Holacracy (et réunions collaboratives en général).
Open source, licence AGPL-3.0. Repo GitHub public : `semawe/triage-app`.

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
- **Server Actions** pour toutes les mutations (pas d'API REST)
- **Server-Sent Events** (temps réel) : Phase 4
- **Docker + Nginx** (deploy VPS OVH) : Phase 4

## Schéma de données (Prisma)

```
Organisation          (id, name, slug)
User                  (id, email, name, avatar)
OrganisationMember    (org_id, user_id, role: admin|member)
Space                 (id, org_id, name, type: circle|project|instance)
SpaceMember           (space_id, user_id, role)
Meeting               (id, space_id, date, durationMinutes?, openedAt?,
                       status: draft|open|closed)
AgendaItem            (id, meeting_id, author_id, title, order, status: pending|active|done)
Output                (id, item_id, type: note|action|decision|project|governance, content,
                       assignee_id, due_date)
```

## Architecture — fichiers clés

```
src/
  lib/auth.ts           # NextAuth v5 config (Google OAuth, PrismaAdapter)
  lib/prisma.ts         # Singleton PrismaClient avec PrismaPg adapter
  lib/session.ts        # requireAuth() / requireOrg() — redirections locale-aware
  actions/org.ts        # createOrg (Server Action)
  actions/meeting.ts    # createMeeting, addAgendaItem, openMeeting, jumpToItem,
                        # nextItem, closeMeeting
  actions/output.ts     # addOutput
  i18n/routing.ts       # defineRouting({ locales: ['fr','en'], defaultLocale: 'fr' })
  i18n/navigation.ts    # createNavigation(routing) — Link, redirect locale-aware
  i18n/request.ts       # getRequestConfig → messages/${locale}.json
  proxy.ts              # next-intl middleware (remplace middleware.ts, convention Next.js 16)
  app/[locale]/
    layout.tsx          # NextIntlClientProvider
    setup/page.tsx      # Onboarding : créer une organisation
    meetings/page.tsx   # Liste + formulaire de création (date+heure+durée)
    meetings/[id]/
      page.tsx          # Facilitation RSC (agenda, point actif, outputs, récap)
      PistesPanel.tsx   # Client — panneau 6 pistes + onglet tactiques Holacracy
      Chrono.tsx        # Client — compte à rebours (ou chrono montant si sans durée)
  components/AppShell.tsx  # Nav bar dark mode
messages/
  fr.json               # Traductions françaises
  en.json               # Traductions anglaises
prisma/schema.prisma    # Schéma complet (Organisation, Space, Role, Meeting, AgendaItem, Output)
```

## Notes techniques importantes

- **`params` comme Promise** : `const { id } = await params` dans les page components (Next.js 16)
- **`datetime-local` → Date locale** : `parseDatetimeLocal()` dans `actions/meeting.ts` pour éviter le décalage UTC
- **jump-to-item** : `updateMany` active→pending puis `update` cible→active (préserve le retour en arrière)
- **Avatars auteur** : Google OAuth fournit `image` URL dans la session ; fallback initiales
- **Chrono** : client component avec `setInterval`, rouge+pulse quand dépassé, orange sous 5 min

## Roadmap

- **Phase 0** ✅ : Fondations — repo, schéma Prisma, auth Google, dark mode, i18n fr/en
- **Phase 1** ✅ : Triage V1 — onboarding org, agenda, facilitation, 6 pistes GTD, outputs
- **Phase 2** ✅ : Améliorations facilitation — chrono, jump-to-item, avatars, pistes Holacracy, programmation avancée (date+heure+durée)
- **Phase 3** : Espaces/Rôles — gestion cercles/projets, assignation rôles, membres ; compte-rendu email participants
- **Phase 4** : Export (Notion + Google Drive) + Temps réel (SSE)

## Base de données — dev

**Local (Mac)** : Postgres.app v2.9.5, base `triageapp`, user `aliocha` (pas de mot de passe, socket Unix).
```
DATABASE_URL="postgresql://aliocha@localhost:5432/triageapp"
```

**VPS OVH** (prod à venir) : `debian@51.178.234.59`, même instance que of-qualiopi.
Connexion locale via tunnel SSH :
```bash
ssh -N -L 15432:localhost:5432 -i ~/.ssh/id_semawe_master debian@51.178.234.59 &
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
- Prisma migrations : toujours via `prisma migrate dev` (jamais `db push` en prod)
