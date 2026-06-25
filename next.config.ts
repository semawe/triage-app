import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Sur le VPS (RAM limitée), le type-check et l'ESLint intégrés au build
// peuvent être tués par l'OOM. Ils restent actifs par défaut (dev/CI) ;
// on les saute uniquement quand SKIP_BUILD_CHECKS=1, après un `tsc --noEmit`
// et un `eslint` déjà passés en amont.
const skipBuildChecks = process.env.SKIP_BUILD_CHECKS === "1";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  typescript: { ignoreBuildErrors: skipBuildChecks },
  eslint: { ignoreDuringBuilds: skipBuildChecks },
};

export default withNextIntl(nextConfig);
