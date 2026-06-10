"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";

const SECTIONS = [
  { id: "visao", label: "Visão Geral" },
  { id: "origem", label: "Origem" },
  { id: "campanhas", label: "Campanhas" },
  { id: "atendimento", label: "Atendimento" },
  { id: "evolucao", label: "Evolução" },
];

export function PortalNav() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("visao");

  // Scrollspy — destaca a seção visível durante a leitura da história
  useEffect(() => {
    const els = SECTIONS
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (!els.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -55% 0px", threshold: 0 }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

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
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(7,11,22,0.85)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
      }}
    >
      <div
        style={{
          maxWidth: 1060,
          margin: "0 auto",
          padding: "0 24px",
          height: 58,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Marca */}
        <a href="#visao" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 8,
              background: "linear-gradient(135deg, #6366F1 0%, #818CF8 100%)",
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
            <p style={{ fontSize: 13.5, fontWeight: 650, color: "rgba(255,255,255,0.92)", letterSpacing: "-0.2px" }}>
              Veloce
            </p>
            <p style={{ fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,0.38)", letterSpacing: "0.4px", textTransform: "uppercase" }}>
              Centro de Performance
            </p>
          </div>
        </a>

        {/* Âncoras desktop */}
        <nav className="hidden md:flex" style={{ alignItems: "center", gap: 2 }}>
          {SECTIONS.map(({ id, label }) => (
            <a
              key={id}
              href={`#${id}`}
              className="portal-anchor-link"
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: 500,
                textDecoration: "none",
                color: active === id ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.42)",
                background: active === id ? "rgba(255,255,255,0.07)" : "transparent",
                transition: "all 160ms",
              }}
            >
              {label}
            </a>
          ))}
        </nav>

        {/* Lado direito */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={logout}
            title="Sair"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: "rgba(255,255,255,0.4)",
              fontSize: 13,
              cursor: "pointer",
              transition: "color 120ms",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.75)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}
          >
            <LogOut size={15} />
            <span className="hidden md:inline">Sair</span>
          </button>

          <button
            className="md:hidden"
            onClick={() => setOpen(!open)}
            style={{ padding: 6, background: "transparent", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer" }}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Menu mobile */}
      {open && (
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(7,11,22,0.98)",
            padding: "8px 16px 16px",
          }}
        >
          {SECTIONS.map(({ id, label }) => (
            <a
              key={id}
              href={`#${id}`}
              onClick={() => setOpen(false)}
              style={{
                display: "block",
                padding: "10px 12px",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
                color: active === id ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.55)",
                background: active === id ? "rgba(255,255,255,0.07)" : "transparent",
                marginBottom: 2,
              }}
            >
              {label}
            </a>
          ))}
        </div>
      )}
    </header>
  );
}
