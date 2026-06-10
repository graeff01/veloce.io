"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { LogOut, Moon, Sun } from "lucide-react";

const PAGES = [
  { href: "/portal", label: "Visão Geral" },
  { href: "/portal/evolucao", label: "Evolução" },
];

// Chrome mínimo do portal: marca + tema + sair. Sem navegação interna — o
// cliente vê tudo numa página. Mesma linguagem visual e mesmo toggle de tema
// do Veloce.io (compartilha a chave "veloce-theme").
export function PortalNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("veloce-theme");
    const nextDark = saved === "dark";
    setDark(nextDark);
    document.documentElement.dataset.theme = nextDark ? "dark" : "light";
  }, []);

  function toggleTheme() {
    const nextDark = !dark;
    setDark(nextDark);
    document.documentElement.dataset.theme = nextDark ? "dark" : "light";
    localStorage.setItem("veloce-theme", nextDark ? "dark" : "light");
  }

  async function logout() {
    await fetch("/api/portal/v1/auth/logout", { method: "POST" });
    router.replace("/portal/login");
  }

  const iconBtn: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 34,
    height: 34,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    color: "var(--text-secondary)",
    cursor: "pointer",
    transition: "background 150ms, color 150ms",
  };

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        borderBottom: "1px solid var(--border)",
        background: "color-mix(in srgb, var(--bg-surface) 82%, transparent)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      <div
        style={{
          padding: "0 clamp(20px, 4vw, 48px)",
          height: 56,
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
              Centro de Performance
            </p>
          </div>
        </div>

        {/* Navegação (2 páginas) */}
        <nav style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {PAGES.map(({ href, label }) => {
            const active = href === "/portal" ? pathname === "/portal" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                style={{
                  padding: "7px 14px",
                  borderRadius: 9,
                  fontSize: 13,
                  fontWeight: 500,
                  textDecoration: "none",
                  color: active ? "var(--text-primary)" : "var(--text-muted)",
                  background: active ? "var(--bg-hover)" : "transparent",
                  transition: "color 150ms, background 150ms",
                }}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={toggleTheme}
            title={dark ? "Tema claro" : "Tema escuro"}
            style={iconBtn}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-surface)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
          >
            {dark ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          <button
            onClick={logout}
            title="Sair"
            style={{ ...iconBtn, width: "auto", gap: 7, padding: "0 13px", fontSize: 13, fontWeight: 500 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-surface)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
          >
            <LogOut size={15} />
            Sair
          </button>
        </div>
      </div>
    </header>
  );
}
