import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    BYPASS_AUTH: process.env.BYPASS_AUTH ?? "",
  },
};

export default nextConfig;
