import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  env: {
    // Exposed to Edge Runtime (proxy.ts). Set to "true" locally to skip auth.
    // Must be unset or "false" on Railway.
    DISABLE_AUTH: process.env.DISABLE_AUTH ?? "false",
  },
};

export default nextConfig;
