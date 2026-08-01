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
  // Cabeçalhos de segurança (sem CSP estrita p/ não quebrar os estilos inline).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // SAMEORIGIN (não DENY): permite o PRÓPRIO site embutir seu conteúdo em iframe
          // (ex.: o modal que mostra o PDF do orçamento dentro do PWA). Outros sites seguem
          // bloqueados (anti-clickjacking preservado).
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
