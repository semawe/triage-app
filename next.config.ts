import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Sur le VPS (RAM limitée), le type-check intégré à `next build` est tué par
// l'OOM. Il reste actif par défaut (dev/CI) ; on le saute uniquement quand
// SKIP_BUILD_CHECKS=1, après un `tsc --noEmit` déjà passé en amont.
// (Next 16 ne lance plus ESLint au build : pas de clé `eslint` ici.)
const skipBuildChecks = process.env.SKIP_BUILD_CHECKS === "1";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  typescript: { ignoreBuildErrors: skipBuildChecks },
};

export default withNextIntl(nextConfig);
