// Chargement des variables d'environnement pour les commandes `prisma` (CLI).
//
// `dotenv/config` ne lit que `.env`, alors que l'application, elle, lit
// `.env.local` — c'est Next.js qui s'en charge au runtime. Sur un clone neuf,
// l'écart se payait à la première commande : `prisma migrate deploy` échouait
// sur « The datasource.url property is required » alors que `.env.local` était
// bien renseigné. On aligne donc le CLI sur la convention Next.
//
// L'ordre compte : dotenv ne réécrit jamais une variable déjà définie, donc
// `.env.local` l'emporte sur `.env`, et une variable déjà exportée dans
// l'environnement (CI, script de déploiement) l'emporte sur les deux.
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

loadEnv({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
