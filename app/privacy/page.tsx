import type { Metadata } from "next";
import { PrivacyPolicyContent } from "@/components/privacy-policy";

export const metadata: Metadata = {
  title: "Política de Privacidade — Veloce",
  description: "Como a Veloce coleta, usa e protege os dados no atendimento via WhatsApp.",
};

// Página PÚBLICA (fora do grupo (dashboard)) — usada como URL de política de
// privacidade do app da Meta/WhatsApp e para conformidade LGPD. O conteúdo vem do
// componente compartilhado (mesma fonte usada no modal do login do portal).
export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 20px 96px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Veloce" width={40} height={40} style={{ borderRadius: 8 }} />
        <span style={{ fontWeight: 700, fontSize: 18, color: "#4F46E5", fontFamily: "system-ui, sans-serif" }}>Veloce</span>
      </div>
      <PrivacyPolicyContent />
    </main>
  );
}
