import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent Turbopack from bundling native/driver modules — require them at
  // runtime instead so module internals (including URL strings) are not
  // transformed or corrupted during the bundling step.
  serverExternalPackages: [
    "@libsql/client",
    "@prisma/adapter-libsql",
    "@prisma/client",
  ],
};

export default nextConfig;
