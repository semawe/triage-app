import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Client Prisma généré : ni écrit ni relu à la main, il produisait à lui
    // seul l'essentiel des 593 erreurs qui rendaient `npm run lint` inutilisable.
    "src/generated/**",
    // Worktrees Git des sessions Claude Code : copies du dépôt à l'intérieur du
    // dépôt. Sans cette ligne, chaque fichier est linté deux fois et les
    // avertissements apparaissent en double.
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
