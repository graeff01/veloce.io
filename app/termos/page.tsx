import type { Metadata } from "next";
import { TermsOfServiceContent } from "@/components/terms-of-service";

export const metadata: Metadata = {
  title: "Termos de Serviço — Veloce",
  description: "Termos de uso da plataforma Veloce de atendimento por WhatsApp.",
};

export default function TermsPage() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 20px 96px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Veloce" width={40} height={40} style={{ borderRadius: 8 }} />
        <span style={{ fontWeight: 700, fontSize: 18, color: "#4F46E5", fontFamily: "system-ui, sans-serif" }}>Veloce</span>
      </div>
      <TermsOfServiceContent />
    </main>
  );
}
