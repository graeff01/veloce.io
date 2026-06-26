"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Sun, Moon, LayoutDashboard, MessageCircle } from "lucide-react";

// Réplica enxuta do sistema pro cliente: sidebar white-label (logo do cliente +
// Painel/Conversas + toggle de tema). Só PC (>=1024px); no celular fica escondida
// e o conteúdo segue como antes.
export function PortalShell({ token, brandName, logoUrl, active }: { token: string; brandName: string; logoUrl: string | null; active: "painel" | "conversas" }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => { setTheme(document.documentElement.getAttribute("data-pt") === "dark" ? "dark" : "light"); }, []);
  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-pt", next);
    try { localStorage.setItem(`pt-${token}`, next); } catch { /* ignore */ }
  }

  const item = (key: "painel" | "conversas", href: string, label: string, icon: React.ReactNode) => {
    const on = active === key;
    return (
      <Link href={href} prefetch style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, textDecoration: "none", fontSize: 13.5, fontWeight: on ? 700 : 500, background: on ? "var(--p-accent-soft)" : "transparent", color: on ? "var(--p-accent)" : "var(--p-muted)" }}>
        {icon}{label}
      </Link>
    );
  };

  return (
    <>
      <style>{`.pside{display:none}
        @media(min-width:1024px){ .pside{display:flex} .pmain,.cmain{margin-left:236px} }`}</style>
      <aside className="pside" style={{ position: "fixed", left: 0, top: 0, bottom: 0, width: 236, zIndex: 20, flexDirection: "column", background: "var(--p-surface)", borderRight: "1px solid var(--p-border)", padding: 14 }}>
        {/* marca do cliente */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 6px 14px", borderBottom: "1px solid var(--p-border)" }}>
          {logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={logoUrl} alt="" width={34} height={34} style={{ borderRadius: 9, objectFit: "cover", border: "1px solid var(--p-border)" }} />
            : <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--p-accent)", color: "var(--p-on-accent)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16 }}>{brandName[0]?.toUpperCase()}</div>}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--p-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{brandName}</div>
            <div style={{ fontSize: 10.5, color: "var(--p-muted)" }}>Painel do cliente</div>
          </div>
        </div>

        {/* navegação */}
        <nav style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 12, flex: 1 }}>
          {item("painel", `/r/${token}`, "Painel", <LayoutDashboard size={16} />)}
          {item("conversas", `/r/${token}/conversas`, "Conversas", <MessageCircle size={16} />)}
        </nav>

        {/* tema */}
        <button onClick={toggle} title="Alternar tema" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--p-border)", background: "var(--p-bg)", color: "var(--p-text)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />} {theme === "dark" ? "Tema claro" : "Tema escuro"}
        </button>
      </aside>
    </>
  );
}
