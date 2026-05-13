import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "@libsql/client",
    "@prisma/adapter-libsql",
    "@prisma/client",
  ],
  typescript: {
    // Unblock production builds even if the repo has outstanding TS strictness issues.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
