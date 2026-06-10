"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { BarChart2, Home, Target, MapPin, MessageSquare, TrendingUp, LogOut, Menu, X } from "lucide-react";

const NAV = [
  { href: "/portal", label: "Dashboard", icon: Home },
  { href: "/portal/campanhas", label: "Campanhas", icon: Target },
  { href: "/portal/origem", label: "Origem", icon: MapPin },
  { href: "/portal/atendimento", label: "Atendimento", icon: MessageSquare },
  { href: "/portal/evolucao", label: "Evolução", icon: TrendingUp },
];

export function PortalNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await fetch("/api/portal/v1/auth/logout", { method: "POST" });
    router.replace("/portal/login");
  }

  function isActive(href: string) {
    if (href === "/portal") return pathname === "/portal";
    return pathname.startsWith(href);
  }

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        background: "rgba(11,16,32,0.92)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "0 24px",
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Logo */}
        <Link
          href="/portal"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            textDecoration: "none",
          }}
        >
          <BarChart2 size={18} style={{ color: "#818CF8" }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.92)", letterSpacing: "-0.3px" }}>
            Veloce
          </span>
        </Link>

        {/* Desktop nav */}
        <nav
          className="hidden md:flex"
          style={{ display: "flex", alignItems: "center", gap: 4 }}
        >
          {NAV.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
                textDecoration: "none",
                color: isActive(href) ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.48)",
                background: isActive(href) ? "rgba(255,255,255,0.08)" : "transparent",
                transition: "all 120ms",
              }}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Right side */}
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

          {/* Mobile hamburger */}
          <button
            className="md:hidden"
            onClick={() => setOpen(!open)}
            style={{ padding: 6, background: "transparent", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer" }}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.07)",
            background: "rgba(11,16,32,0.98)",
            padding: "8px 16px 16px",
          }}
        >
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
                color: isActive(href) ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.55)",
                background: isActive(href) ? "rgba(255,255,255,0.08)" : "transparent",
                marginBottom: 2,
              }}
            >
              <Icon size={16} />
              {label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
