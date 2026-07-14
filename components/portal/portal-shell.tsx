"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Sun, Moon, LayoutDashboard, MessageCircle, Filter, Sparkles, Megaphone, Users, LogOut, FlaskConical, TrendingDown } from "lucide-react";
import { PortalAdvisor } from "@/components/portal/portal-advisor";

// Réplica enxuta do sistema pro cliente: sidebar com o MESMO design do sistema
// interno, nas cores do cliente, só com Painel/Conversas + toggle de tema. Só PC
// (>=1024px); no celular fica escondida e o conteúdo segue como antes.
// A sidebar acompanha o tema (clara no claro, escura no escuro) via var(--p-*).
export function PortalShell({ token, brandName, logoUrl, active, sections: initialSections, account: initialAccount, aiTest: initialAiTest }: { token: string; brandName: string; logoUrl: string | null; active: "painel" | "conversas" | "funil" | "ia" | "anuncios" | "equipe" | "teste" | "objecoes"; sections?: string[] | null; account?: { name: string | null; email: string; role: string } | null; aiTest?: boolean }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  // Estado semeado pelo SERVIDOR (props) → 1º paint já vem certo, sem flash ao navegar.
  // Só cai no fetch client-side se a página não passou os dados (retrocompat).
  const hasServerData = initialSections !== undefined;
  const [account, setAccount] = useState<{ name: string | null; email: string; role: string } | null>(initialAccount ?? null);
  const [sections, setSections] = useState<string[] | null>(initialSections ?? null); // null = todas (até carregar)
  const [aiTest, setAiTest] = useState(!!initialAiTest); // aba temporária de teste da IA
  useEffect(() => { setTheme(document.documentElement.getAttribute("data-pt") === "dark" ? "dark" : "light"); }, []);
  useEffect(() => {
    if (hasServerData) return; // servidor já entregou menu/conta — não precisa buscar
    fetch(`/api/portal/${token}/me`).then((r) => (r.ok ? r.json() : null)).then((d) => { setAccount(d?.user ?? null); setSections(d?.sections ?? null); setAiTest(!!d?.aiTest); }).catch(() => {});
  }, [token, hasServerData]);
  const on = (k: string) => !sections || sections.includes(k);
  async function logout() {
    await fetch(`/api/portal/${token}/auth/logout`, { method: "POST" }).catch(() => {});
    window.location.href = `/r/${token}`;
  }
  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-pt", next);
    try { localStorage.setItem(`pt-${token}`, next); } catch { /* ignore */ }
  }

  const item = (key: "painel" | "conversas" | "funil" | "ia" | "anuncios" | "equipe" | "teste" | "objecoes", href: string, label: string, icon: React.ReactNode) => {
    const on = active === key;
    return (
      <Link href={href} prefetch style={{ textDecoration: "none", display: "block" }}>
        <div
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, marginBottom: 2, fontSize: 13, fontWeight: on ? 600 : 400, cursor: "pointer", transition: "background .18s, transform .18s, color .18s", background: on ? "linear-gradient(90deg, var(--p-accent-soft), transparent)" : "transparent", color: on ? "var(--p-accent)" : "var(--p-muted)" }}
          onMouseEnter={(e) => { if (!on) { e.currentTarget.style.background = "var(--p-bg)"; e.currentTarget.style.transform = "translateX(2px)"; } }}
          onMouseLeave={(e) => { if (!on) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.transform = "translateX(0)"; } }}
        >
          {icon}{label}
        </div>
      </Link>
    );
  };

  return (
    <>
      <style>{`.pside{display:none}
        .padvisor{display:none}
        @media(min-width:760px){ .padvisor{display:contents} }
        @media(min-width:1024px){ .pside{display:flex} .pmain,.cmain,.fmain,.imain,.amain{margin-left:236px} }`}</style>
      <aside className="pside" style={{ position: "fixed", left: 0, top: 0, bottom: 0, width: 236, zIndex: 30, flexDirection: "column", background: "var(--p-surface)", borderRight: "1px solid var(--p-border)", padding: 12 }}>
        {/* marca do cliente */}
        <div style={{ display: "flex", alignItems: "center", gap: 9, height: 56, padding: "0 6px", borderBottom: "1px solid var(--p-border)", flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: "var(--p-bg)", border: "1px solid var(--p-border)", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {logoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={logoUrl} alt="" width={32} height={32} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              : <span style={{ fontWeight: 800, fontSize: 15, color: "var(--p-accent)" }}>{brandName[0]?.toUpperCase()}</span>}
          </div>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--p-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>{brandName}</span>
        </div>

        {/* navegação */}
        <nav style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 12, flex: 1 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--p-muted)", textTransform: "uppercase", letterSpacing: 0.6, padding: "0 10px 6px", opacity: 0.7 }}>Menu</div>
          {on("painel") && item("painel", `/r/${token}`, "Painel", <LayoutDashboard size={15} />)}
          {on("anuncios") && item("anuncios", `/r/${token}/anuncios`, "Anúncios", <Megaphone size={15} />)}
          {on("ia") && item("ia", `/r/${token}/ia`, "IA", <Sparkles size={15} />)}
          {on("funil") && item("funil", `/r/${token}/funil`, "Funil", <Filter size={15} />)}
          {on("conversas") && item("conversas", `/r/${token}/conversas`, "Conversas", <MessageCircle size={15} />)}
          {on("objecoes") && item("objecoes", `/r/${token}/objecoes`, "Objeções", <TrendingDown size={15} />)}
          {on("equipe") && item("equipe", `/r/${token}/equipe`, "Equipe", <Users size={15} />)}
          {aiTest && item("teste", `/r/${token}/testar-ia`, "Testar IA", <FlaskConical size={15} />)}
        </nav>

        {/* conta logada (identifica quem está no painel) + sair */}
        {account && (
          <div style={{ borderTop: "1px solid var(--p-border)", paddingTop: 10, marginTop: 4, marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "2px 6px 8px" }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, background: "var(--p-accent)", color: "var(--p-on-accent)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 }}>{(account.name || account.email)[0]?.toUpperCase()}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--p-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{account.name || account.email.split("@")[0]}</div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: account.role === "admin" ? "var(--p-accent)" : "var(--p-muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>{account.role === "admin" ? "Admin" : "Atendente"}</div>
              </div>
            </div>
            <button onClick={logout} title="Sair" style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--p-border)", background: "var(--p-bg)", color: "var(--p-muted)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              <LogOut size={15} /> Sair
            </button>
          </div>
        )}

        {/* tema */}
        <button onClick={toggle} title="Alternar tema" style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 10px", borderRadius: 8, border: "1px solid var(--p-border)", background: "var(--p-bg)", color: "var(--p-muted)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />} {theme === "dark" ? "Tema claro" : "Tema escuro"}
        </button>
      </aside>

      {/* Consultor Veloce — assistente flutuante (escondido no mobile via .padvisor) */}
      <div className="padvisor"><PortalAdvisor token={token} /></div>
    </>
  );
}
