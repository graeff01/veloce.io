import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  // @react-pdf/renderer traz dependências nativas (fontes) que não devem ser
  // empacotadas pelo bundler do servidor — externaliza para gerar PDF no runtime.
  serverExternalPackages: ["@react-pdf/renderer"],
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
  // Cabeçalhos de segurança (sem CSP estrita p/ não quebrar os estilos inline).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
