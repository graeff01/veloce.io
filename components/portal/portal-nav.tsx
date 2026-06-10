"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

// Chrome mínimo do portal: marca + sair. Sem navegação interna — o cliente vê
// tudo em uma página só. Mesma linguagem visual da topbar do Veloce.io.
export function PortalNav() {
  const router = useRouter();

  async function logout() {
    await fetch("/api/portal/v1/auth/logout", { method: "POST" });
    router.replace("/portal/login");
  }

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        borderBottom: "1px solid var(--border)",
        background: "rgba(251,251,252,0.82)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      <div
        style={{
          padding: "0 clamp(24px, 5vw, 56px)",
          height: 58,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Marca */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 8,
              background: "linear-gradient(135deg, #4F46E5 0%, #818CF8 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 800,
              color: "#fff",
              letterSpacing: "-0.5px",
            }}
          >
            V
          </div>
          <div style={{ lineHeight: 1.15 }}>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.2px" }}>
              Veloce
            </p>
            <p style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.4px", textTransform: "uppercase" }}>
              Portal do Cliente
            </p>
          </div>
        </div>

        <button
          onClick={logout}
          title="Sair"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "7px 13px",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--bg-surface)",
            color: "var(--text-secondary)",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            transition: "background 150ms, color 150ms",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-surface)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
        >
          <LogOut size={15} />
          Sair
        </button>
      </div>
    </header>
  );
}
