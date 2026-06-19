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

- **Next.js 15** (App Router, React Server Components)
- **PostgreSQL** (VPS OVH)
- **Prisma** (ORM, migrations)
- **NextAuth.js v5** (Google OAuth + magic links via Resend)
- **Server-Sent Events** (temps réel, 20-30 participants max par réunion)
- **Tailwind CSS + shadcn/ui**
- **Docker + Nginx** (deploy VPS OVH)

## Schéma de données (Prisma)

```
Organisation          (id, name, slug)
User                  (id, email, name, avatar)
OrganisationMember    (org_id, user_id, role: admin|member)
Space                 (id, org_id, name, type: circle|project)
SpaceMember           (space_id, user_id, role)
Meeting               (id, space_id, date, status: draft|open|closed)
AgendaItem            (id, meeting_id, author_id, title, order, status: pending|active|done)
Output                (id, item_id, type: note|action|decision|project, content,
                       assignee_id, due_date)
```

## Roadmap

- **Phase 0** : Fondations — repo, schéma Prisma, auth, orgs/espaces/membres, deploy VPS
- **Phase 1** : Triage V1 — agenda, facilitation, 6 pistes, outputs
- **Phase 2** : Export — Notion + Google Drive
- **Phase 3** : Synchro (post-V1)

## Base de données — dev

PostgreSQL sur VPS OVH `debian@51.178.234.59` (même instance que of-qualiopi).
Base : `triageapp`, user : `triageapp`. Connexion locale via tunnel SSH :

```bash
ssh -N -L 15432:localhost:5432 -i ~/.ssh/id_semawe_master debian@51.178.234.59 &
```

DATABASE_URL dev : `postgresql://triageapp:<mdp>@localhost:15432/triageapp`
DATABASE_URL prod (sur le VPS) : `postgresql://triageapp:<mdp>@localhost:5432/triageapp`

Le mot de passe est dans `.env.local` (gitignorée) et dans la page Secrets Notion.
Migration : `npx prisma migrate dev --name <nom>` (tunnel ouvert requis).

## Autonomie

Périmètre standard Claude Code (§5 CLAUDE.md racine).
Validation requise pour : config infra VPS (Nginx, Docker, cron serveur), clés OAuth en production.

## Conventions

- Commits en français ou en anglais (cohérent par session)
- Pas de `console.log` laissés en prod
- Variables d'environnement dans `.env.local` (gitignorée) — jamais en clair dans le code
- Prisma migrations : toujours via `prisma migrate dev` (jamais `db push` en prod)
