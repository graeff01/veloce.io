"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle, Megaphone, Filter, FileText } from "lucide-react";
import { modulosPortal, type ModuloPortal } from "@/lib/portal/modulos";

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

export function PortalMobileNav({ token, active, sections, quotesEnabled }: {
  token: string;
  active: ModuloPortal | null;
  /** Seções do usuário. `undefined`/`null` = todas (cliente sem configuração). */
  sections?: string[] | null;
  quotesEnabled?: boolean;
}) {
  // Contadores: os mesmos do desktop, pelo mesmo endpoint leve — a barra precisa
  // dizer o mesmo número em qualquer tela, senão vira uma segunda opinião.
  const [waiting, setWaiting] = useState(0);
  const [reviews, setReviews] = useState(0);
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
  // Um destino só não é barra de navegação — é um botão sem função.
  if (modulos.length < 2) return null;

  const contagem = (chave: ModuloPortal) =>
    chave === "conversas" ? waiting : chave === "revisao" ? reviews : 0;

  return (
    <>
      <style>{`.pmobnav{position:fixed;left:16px;right:16px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:30;display:flex;gap:2px;padding:5px;background:color-mix(in srgb, var(--p-surface) 78%, transparent);backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);border:1px solid color-mix(in srgb, var(--p-border) 50%, transparent);border-radius:22px;box-shadow:0 4px 20px rgba(0,0,0,.10);animation:pmobnavUp .34s cubic-bezier(.22,1,.36,1)}
        @keyframes pmobnavUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
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
      </nav>
    </>
  );
}
