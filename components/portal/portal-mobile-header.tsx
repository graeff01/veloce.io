"use client";

import { useEffect, useState } from "react";
import { MoreHorizontal, UserRound, X, LogOut } from "lucide-react";
import { ferramentasDoPortal, modulosPortal } from "@/lib/portal/modulos";

// ── Cabeçalho padrão do PWA no celular ────────────────────────────────────────
// Réplica do que definimos no aplicativo (apps/mobile/src/ui/pilha.tsx):
//
//   • TÍTULO COMPACTO na barra, nunca título grande. É regra de produto, não
//     estética: o título grande come um terço da primeira tela e some ao rolar.
//     Num app de trabalho, onde a pessoa quer ver CONTEÚDO já na abertura, ele
//     custa mais do que entrega.
//   • ESQUERDA: botão "Mais" circular — aparência, ferramentas e ajuda.
//   • DIREITA: perfil, só onde faz sentido (na lista de conversas, como no app).
//
// Antes, cada página do portal montava o próprio cabeçalho e nenhuma era igual à
// outra. Aqui a identidade vive num lugar só: mudou aqui, mudou em todas.
//
// Some a partir de 1024px, onde o menu lateral assume a navegação e a identidade.

export function PortalMobileHeader({ token, titulo, account, sections, quotesEnabled, comPerfil = false }: {
  token: string;
  titulo: string;
  account?: { email: string; name: string | null; role: string } | null;
  /** Seções do usuário — decidem o que a folha "Mais" lista em Ferramentas. */
  sections?: string[] | null;
  /** Precisa casar com o da barra: é o que decide se Orçamentos ocupa um lugar. */
  quotesEnabled?: boolean;
  /** Perfil à direita. No aplicativo, só a lista de conversas tem. */
  comPerfil?: boolean;
}) {
  const [mais, setMais] = useState(false);
  const [conta, setConta] = useState(false);
  const [tema, setTema] = useState<"light" | "dark">("light");

  useEffect(() => {
    setTema(document.documentElement.getAttribute("data-pt") === "dark" ? "dark" : "light");
  }, []);

  // Esc fecha qualquer folha aberta, como em qualquer modal.
  useEffect(() => {
    if (!mais && !conta) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") { setMais(false); setConta(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mais, conta]);

  // Mesma troca de tema do menu lateral: atributo no <html> + lembrança local.
  // Reimplementar a regra seria arriscar as duas telas discordarem do tema atual.
  function trocarTema() {
    const proximo = tema === "dark" ? "light" : "dark";
    setTema(proximo);
    document.documentElement.setAttribute("data-pt", proximo);
    try { localStorage.setItem(`pt-${token}`, proximo); } catch { /* modo privado */ }
  }

  async function sair() {
    if (!window.confirm("Sair da conta? Você precisará entrar de novo neste aparelho.")) return;
    await fetch(`/api/portal/${token}/auth/logout`, { method: "POST" }).catch(() => {});
    window.location.href = `/r/${token}`;
  }

  // O que a barra já leva não é "trabalho de mesa" — dizer que está só no portal
  // web sobre algo que está a um toque daqui seria mentira na cara da pessoa.
  const naBarra = modulosPortal(sections, !!quotesEnabled).map((m) => m.chave);
  const ferramentas = ferramentasDoPortal(sections, naBarra);

  const botao = {
    width: 34, height: 34, borderRadius: 17, display: "inline-flex" as const,
    alignItems: "center" as const, justifyContent: "center" as const,
    border: "none", cursor: "pointer" as const, flexShrink: 0,
  };

  return (
    <>
      <style>{`
        .pmhead{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:10px;
          padding:calc(10px + env(safe-area-inset-top)) 14px 10px;
          background:var(--p-surface);border-bottom:1px solid var(--p-border)}
        .pmtitle{flex:1;min-width:0;text-align:center;font-size:16.5px;font-weight:800;
          letter-spacing:-0.01em;color:var(--p-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .pmsheet{animation:pmsheetUp .28s cubic-bezier(.22,1,.36,1)}
        @keyframes pmsheetUp{from{transform:translateY(100%)}to{transform:none}}
        @media(prefers-reduced-motion:reduce){ .pmsheet{animation:none} }
        /* O título passou para a barra: no celular, o do conteúdo viraria eco. */
        @media(max-width:1023px){ .pm-titulo-conteudo{display:none} }
        @media(min-width:1024px){ .pmhead{display:none} }
      `}</style>

      <header className="pmhead">
        <button onClick={() => setMais(true)} aria-label="Mais opções" aria-expanded={mais}
          style={{ ...botao, background: "color-mix(in srgb, var(--p-accent) 12%, transparent)", color: "var(--p-accent)" }}>
          <MoreHorizontal size={20} />
        </button>

        <h1 className="pmtitle">{titulo}</h1>

        {comPerfil ? (
          <button onClick={() => setConta(true)} aria-label="Perfil e conta" aria-expanded={conta}
            style={{ ...botao, background: "transparent", color: "var(--p-accent)" }}>
            <UserRound size={24} />
          </button>
        ) : (
          // Espaço reservado: sem ele o título deixa de ficar centralizado.
          <span aria-hidden style={{ width: 34, flexShrink: 0 }} />
        )}
      </header>

      {(mais || conta) && (
        <>
          <div onClick={() => { setMais(false); setConta(false); }}
            style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,.35)" }} />
          <div role="dialog" aria-label={mais ? "Mais opções" : "Conta"} className="pmsheet"
            style={{ position: "fixed", zIndex: 71, left: 0, right: 0, bottom: 0, maxHeight: "76vh", overflowY: "auto", background: "var(--p-surface)", borderTop: "1px solid var(--p-border)", borderRadius: "18px 18px 0 0", boxShadow: "0 -12px 40px rgba(0,0,0,.22)", paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
            <div aria-hidden style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}>
              <span style={{ width: 38, height: 4, borderRadius: 2, background: "var(--p-border)" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px 4px" }}>
              <strong style={{ flex: 1, fontSize: 15.5, color: "var(--p-text)" }}>{mais ? "Mais" : "Conta"}</strong>
              <button onClick={() => { setMais(false); setConta(false); }} aria-label="Fechar"
                style={{ border: "none", background: "transparent", color: "var(--wa-muted)", cursor: "pointer", display: "inline-flex", padding: 4 }}>
                <X size={16} />
              </button>
            </div>

            {mais ? (
              <FolhaMais tema={tema} trocarTema={trocarTema} ferramentas={ferramentas} />
            ) : (
              <FolhaConta account={account ?? null} sair={sair} />
            )}
          </div>
        </>
      )}
    </>
  );
}

const rotuloSecao: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: "var(--wa-muted)",
  textTransform: "uppercase", letterSpacing: 0.5, padding: "10px 12px 6px",
};

function FolhaMais({ tema, trocarTema, ferramentas }: {
  tema: "light" | "dark"; trocarTema: () => void; ferramentas: { chave: string; rotulo: string }[];
}) {
  return (
    <div style={{ padding: "0 10px" }}>
      <div style={rotuloSecao}>Aparência</div>
      <button onClick={trocarTema}
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 12px", borderRadius: 10, border: "none", background: "transparent", cursor: "pointer", textAlign: "left" }}>
        <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600, color: "var(--p-text)" }}>
          Tema {tema === "dark" ? "escuro" : "claro"}
        </span>
        <span style={{ fontSize: 11.5, color: "var(--p-accent)", fontWeight: 700 }}>trocar</span>
      </button>

      {ferramentas.length > 0 && (
        <>
          <div style={rotuloSecao}>Ferramentas</div>
          <div style={{ fontSize: 11.5, color: "var(--wa-muted)", padding: "0 12px 8px", lineHeight: 1.45 }}>
            Relatório, configuração e auditoria são trabalho de mesa: ficam no
            portal web, onde a tela é grande o bastante para eles.
          </div>
          {ferramentas.map((f) => (
            <div key={f.chave} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px" }}>
              <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600, color: "var(--p-text)" }}>{f.rotulo}</span>
              <span style={{ fontSize: 11.5, color: "var(--wa-muted)", whiteSpace: "nowrap" }}>no portal web</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function FolhaConta({ account, sair }: {
  account: { email: string; name: string | null; role: string } | null; sair: () => void;
}) {
  return (
    <div style={{ padding: "0 10px" }}>
      {account && (
        <div style={{ padding: "6px 12px 12px" }}>
          <div style={{ fontSize: 15.5, fontWeight: 700, color: "var(--p-text)" }}>{account.name || account.email}</div>
          <div style={{ fontSize: 12, color: "var(--wa-muted)", marginTop: 2 }}>
            {account.name ? `${account.email} · ` : ""}{account.role === "admin" ? "Administrador" : "Atendente"}
          </div>
        </div>
      )}
      <button onClick={sair}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "13px 12px", borderRadius: 12, border: "1px solid var(--p-border)", background: "transparent", color: "var(--p-crit, #dc2626)", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
        <LogOut size={16} /> Sair da conta
      </button>
    </div>
  );
}
