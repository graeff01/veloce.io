import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  experimental: {
    // Audio uploads for meeting transcription can be large. The proxy buffers
    // the request body in memory with a 10MB default limit, which truncates the
    // upload and makes formData() fail. Groq Whisper accepts up to 25MB, so we
    // allow a bit above that.
    proxyClientMaxBodySize: "30mb",
  },
  env: {
    // Exposed to Edge Runtime (proxy.ts). Set to "true" locally to skip auth.
    // Must be unset or "false" on Railway.
    DISABLE_AUTH: process.env.DISABLE_AUTH ?? "false",
  },
};

export default nextConfig;
