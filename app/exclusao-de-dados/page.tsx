import type { Metadata } from "next";
import { DataDeletionContent } from "@/components/data-deletion";

export const metadata: Metadata = {
  title: "Exclusão de Dados — Veloce",
  description: "Como solicitar a exclusão dos seus dados e exercer seus direitos (LGPD).",
};

export default function DataDeletionPage() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 20px 96px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Veloce" width={40} height={40} style={{ borderRadius: 8 }} />
        <span style={{ fontWeight: 700, fontSize: 18, color: "#4F46E5", fontFamily: "system-ui, sans-serif" }}>Veloce</span>
      </div>
      <DataDeletionContent />
    </main>
  );
}
