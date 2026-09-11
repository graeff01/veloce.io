"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle, Megaphone, Filter, FileText, MoreHorizontal, X, LogOut } from "lucide-react";
import { ferramentasDoPortal, modulosPortal, type ModuloPortal } from "@/lib/portal/modulos";

// ── Barra inferior do PWA no celular ──────────────────────────────────────────
// FONTE ÚNICA. Antes existiam DUAS barras: uma escrita dentro de
// portal-conversations e esta, usada só pela tela de Revisão. Daí vinham três
// defeitos que se sentiam no telefone: a barra PISCAVA ao trocar de módulo
// (porque era outra barra remontando), páginas como Fechamento, Funil e Equipe
// ficavam SEM barra nenhuma, e o conjunto não respeitava as seções do usuário.
//
// REGRA DE PRODUTO, a mesma do aplicativo: a barra lista MÓDULOS, não filtros.
// A versão anterior misturava os dois — "Aguardando" e "Anúncios" apontavam para
// `/conversas?tab=…`, que são filtros da caixa de entrada. Agora Anúncios leva ao
// módulo de Anúncios, e o filtro por anúncio continua onde sempre esteve: dentro
// de Conversas. "Aguardando" saiu: cada linha já mostra há quanto tempo o lead
// espera, com a cor subindo de verde a vermelho.
//
// Some no desktop (>=761px), onde a navegação é a barra lateral.

const ICONE: Record<ModuloPortal, React.ReactNode> = {
  conversas: <MessageCircle size={20} />,
  anuncios: <Megaphone size={20} />,
  funil: <Filter size={20} />,
  revisao: <FileText size={20} />,
};

export function PortalMobileNav({ token, active, sections, quotesEnabled, account }: {
  token: string;
  active: ModuloPortal | null;
  /** Seções do usuário. `undefined`/`null` = todas (cliente sem configuração). */
  sections?: string[] | null;
  quotesEnabled?: boolean;
  /** Quem está logado — a folha "Conta" mostra e é de onde se sai. */
  account?: { email: string; name: string | null; role: string } | null;
}) {
  // Contadores: os mesmos do desktop, pelo mesmo endpoint leve — a barra precisa
  // dizer o mesmo número em qualquer tela, senão vira uma segunda opinião.
  const [waiting, setWaiting] = useState(0);
  const [reviews, setReviews] = useState(0);
  const [mais, setMais] = useState(false);
  const [tema, setTema] = useState<"light" | "dark">("light");
  useEffect(() => {
    setTema(document.documentElement.getAttribute("data-pt") === "dark" ? "dark" : "light");
  }, []);

  // Mesma troca de tema do menu lateral: atributo no <html> + lembrança local.
  // Duplicar a lógica seria arriscar as duas telas discordarem do tema atual.
  function trocarTema() {
    const proximo = tema === "dark" ? "light" : "dark";
    setTema(proximo);
    document.documentElement.setAttribute("data-pt", proximo);
    try { localStorage.setItem(`pt-${token}`, proximo); } catch { /* modo privado */ }
  }

  async function sair() {
    if (!window.confirm("Sair da conta?")) return;
    await fetch(`/api/portal/${token}/auth/logout`, { method: "POST" }).catch(() => {});
    window.location.href = `/r/${token}`;
  }
  useEffect(() => {
    let alive = true;
    const tick = () => fetch(`/api/portal/${token}/badges`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) { setWaiting(d.waiting ?? 0); setReviews(d.reviews ?? 0); } })
      .catch(() => { /* contador é enfeite: falhar aqui não pode aparecer na tela */ });
    tick();
    const id = setInterval(tick, 20000);
    return () => { alive = false; clearInterval(id); };
  }, [token]);

  const modulos = modulosPortal(sections, !!quotesEnabled);
  // O que a barra não leva — e que, por decisão de produto, NÃO ganha tela no
  // celular: é trabalho de mesa e fica no portal web. A folha diz onde estão.
  const ferramentas = ferramentasDoPortal(sections);
  if (modulos.length === 0) return null;

  const contagem = (chave: ModuloPortal) =>
    chave === "conversas" ? waiting : chave === "revisao" ? reviews : 0;

  return (
    <>
      <style>{`.pmobnav{position:fixed;left:16px;right:16px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:30;display:flex;gap:2px;padding:5px;background:color-mix(in srgb, var(--p-surface) 78%, transparent);backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);border:1px solid color-mix(in srgb, var(--p-border) 50%, transparent);border-radius:22px;box-shadow:0 4px 20px rgba(0,0,0,.10);animation:pmobnavUp .34s cubic-bezier(.22,1,.36,1)}
        @keyframes pmobnavUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
        @keyframes pmobsheetUp{from{transform:translateY(100%)}to{transform:none}}
        .pmobsheet{animation:pmobsheetUp .28s cubic-bezier(.22,1,.36,1)}
        @supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){ .pmobnav{background:var(--p-surface)} }
        @media(prefers-reduced-motion:reduce){ .pmobnav{animation:none} }
        @media(min-width:1024px){ .pmobnav{display:none} }
        @media(max-width:1023px){ .pmain,.fmain,.imain,.amain,.tmain,.qmain{padding-bottom:calc(96px + env(safe-area-inset-bottom))} }`}</style>
      <nav className="pmobnav" aria-label="Navegação principal">
        {modulos.map((m) => {
          const on = active === m.chave;
          const n = contagem(m.chave);
          return (
            <Link
              key={m.chave}
              href={`/r/${token}${m.caminho}`}
              prefetch
              aria-current={on ? "page" : undefined}
              style={{ flex: 1, textDecoration: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "7px 4px", borderRadius: 16, background: on ? "color-mix(in srgb, var(--p-accent) 11%, transparent)" : "transparent", color: on ? "var(--p-accent)" : "var(--wa-muted)", transition: "color .2s ease, background .2s ease" }}
            >
              <span style={{ position: "relative", display: "inline-flex", opacity: on ? 1 : 0.75 }}>
                {ICONE[m.chave]}
                {n > 0 && (
                  <span style={{ position: "absolute", top: -5, right: -10, minWidth: 15, height: 15, padding: "0 4px", borderRadius: 8, background: "#1FA855", color: "#fff", fontSize: 9.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>
                    {n > 99 ? "99+" : n}
                  </span>
                )}
              </span>
              <span style={{ fontSize: 10.5, fontWeight: on ? 700 : 500, letterSpacing: "-0.01em" }}>{m.rotulo}</span>
            </Link>
          );
        })}
        {(
          <button onClick={() => setMais(true)} aria-label="Mais seções" aria-expanded={mais}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "7px 4px", borderRadius: 16, border: "none", background: mais ? "color-mix(in srgb, var(--p-accent) 11%, transparent)" : "transparent", color: mais ? "var(--p-accent)" : "var(--wa-muted)", cursor: "pointer" }}>
            <span style={{ display: "inline-flex", opacity: mais ? 1 : 0.75 }}><MoreHorizontal size={20} /></span>
            <span style={{ fontSize: 10.5, fontWeight: mais ? 700 : 500, letterSpacing: "-0.01em" }}>Mais</span>
          </button>
        )}
      </nav>

      {/* Folha "Mais", como no aplicativo: sobe de baixo, onde o polegar alcança. */}
      {mais && (
        <>
          <div onClick={() => setMais(false)} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,.35)" }} />
          <div role="dialog" aria-label="Mais seções" className="pmobsheet"
            style={{ position: "fixed", zIndex: 71, left: 0, right: 0, bottom: 0, maxHeight: "76vh", overflowY: "auto", background: "var(--p-surface)", borderTop: "1px solid var(--p-border)", borderRadius: "18px 18px 0 0", boxShadow: "0 -12px 40px rgba(0,0,0,.22)", paddingBottom: "calc(14px + env(safe-area-inset-bottom))" }}>
            <div aria-hidden style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}>
              <span style={{ width: 38, height: 4, borderRadius: 2, background: "var(--p-border)" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px 6px" }}>
              <strong style={{ flex: 1, fontSize: 12, color: "var(--wa-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Ferramentas</strong>
              <button onClick={() => setMais(false)} aria-label="Fechar" style={{ border: "none", background: "transparent", color: "var(--wa-muted)", cursor: "pointer", display: "inline-flex", padding: 4 }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: "0 10px 6px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--wa-muted)", textTransform: "uppercase", letterSpacing: 0.5, padding: "6px 12px 6px" }}>Aparência</div>
              <button onClick={trocarTema}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 12px", borderRadius: 10, border: "none", background: "transparent", cursor: "pointer", textAlign: "left" }}>
                <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600, color: "var(--p-text)" }}>Tema {tema === "dark" ? "escuro" : "claro"}</span>
                <span style={{ fontSize: 11.5, color: "var(--p-accent)", fontWeight: 700 }}>trocar</span>
              </button>
            </div>

            {ferramentas.length > 0 && (
              <div style={{ padding: "0 10px 6px" }}>
                <div style={{ fontSize: 11, color: "var(--wa-muted)", padding: "2px 12px 8px", lineHeight: 1.45 }}>
                  Estas seções são trabalho de mesa e ficam no portal web, onde a
                  tela é grande o bastante para elas.
                </div>
                {ferramentas.map((f) => (
                  <div key={f.chave} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: 10 }}>
                    <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600, color: "var(--p-text)" }}>{f.rotulo}</span>
                    <span style={{ fontSize: 11.5, color: "var(--wa-muted)", whiteSpace: "nowrap" }}>no portal web</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ padding: "0 10px 6px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--wa-muted)", textTransform: "uppercase", letterSpacing: 0.5, padding: "6px 12px 6px" }}>Conta</div>
              {account && (
                <div style={{ padding: "2px 12px 10px" }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--p-text)" }}>{account.name || account.email}</div>
                  <div style={{ fontSize: 11.5, color: "var(--wa-muted)", marginTop: 1 }}>
                    {account.name ? `${account.email} · ` : ""}{account.role === "admin" ? "Administrador" : "Atendente"}
                  </div>
                </div>
              )}
              <button onClick={() => void sair()}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "11px 12px", borderRadius: 10, border: "1px solid var(--p-border)", background: "transparent", color: "var(--p-crit, #dc2626)", fontSize: 14.5, fontWeight: 700, cursor: "pointer" }}>
                <LogOut size={15} /> Sair da conta
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
