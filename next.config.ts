import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Sur le VPS (RAM limitée), le type-check intégré à `next build` est tué par
// l'OOM. Il reste actif par défaut (dev/CI) ; on le saute uniquement quand
// SKIP_BUILD_CHECKS=1, après un `tsc --noEmit` déjà passé en amont.
// (Next 16 ne lance plus ESLint au build : pas de clé `eslint` ici.)
const skipBuildChecks = process.env.SKIP_BUILD_CHECKS === "1";

/**
 * En-têtes de sécurité qui ne dépendent pas de la requête. Ceux qui en dépendent — la
 * politique de sécurité de contenu, dont le nonce doit être unique par réponse — vivent dans
 * `src/proxy.ts` : voir son en-tête pour le raisonnement. Ceux-ci sont ici parce qu'ils
 * couvrent aussi les chemins que le `matcher` du portier exclut (routes d'API, fichiers
 * statiques).
 */
const entetesDeSecurite = [
  // Redondant avec `frame-ancestors 'none'` de la CSP pour les navigateurs récents, utile pour
  // les autres, et actif sur les chemins hors matcher.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Aucune de ces fonctions n'est utilisée par l'application.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  typescript: { ignoreBuildErrors: skipBuildChecks },
  async headers() {
    return [{ source: "/:path*", headers: entetesDeSecurite }];
  },
};

export default withNextIntl(nextConfig);
