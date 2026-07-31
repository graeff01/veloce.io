"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle, Clock, Megaphone, FileText } from "lucide-react";

// Barra de atalhos inferior (mobile, estilo WhatsApp) COMPARTILHADA entre as telas do portal.
// Antes ela só existia na tela de Conversas (portal-conversations); ao tocar "Orçamentos" o
// usuário ia pra tela de Revisão, que NÃO tinha a barra → ela sumia e parecia o navegador.
// Renderizando esta barra também na Revisão (e afins), a navegação mantém a cara de app.
// Some no desktop (>=761px), onde a nav é a sidebar.
export function PortalMobileNav({ token, active, quotesEnabled }: {
  token: string;
  active: "conversas" | "aguardando" | "anuncios" | "orcamentos";
  quotesEnabled?: boolean;
}) {
  const [reviewCount, setReviewCount] = useState(0);
  useEffect(() => {
    if (!quotesEnabled) return;
    let alive = true;
    const tick = () => fetch(`/api/portal/${token}/quote-reviews`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive) setReviewCount(d?.pending ?? 0); }).catch(() => {});
    tick();
    const id = setInterval(tick, 20000);
    return () => { alive = false; clearInterval(id); };
  }, [token, quotesEnabled]);

  const item = (key: typeof active, href: string, label: string, icon: React.ReactNode, badge = 0) => {
    const on = active === key;
    return (
      <Link key={key} href={href} prefetch style={{ flex: 1, textDecoration: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "7px 4px", borderRadius: 16, background: on ? "color-mix(in srgb, var(--p-accent) 11%, transparent)" : "transparent", color: on ? "var(--p-accent)" : "var(--wa-muted)", transition: "color .2s ease, background .2s ease" }}>
        <span style={{ position: "relative", display: "inline-flex", opacity: on ? 1 : 0.75 }}>
          {icon}
          {badge > 0 && <span style={{ position: "absolute", top: -5, right: -10, minWidth: 15, height: 15, padding: "0 4px", borderRadius: 8, background: "#1FA855", color: "#fff", fontSize: 9.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>{badge > 99 ? "99+" : badge}</span>}
        </span>
        <span style={{ fontSize: 10.5, fontWeight: on ? 700 : 500, letterSpacing: "-0.01em" }}>{label}</span>
      </Link>
    );
  };

  return (
    <>
      <style>{`.pmobnav{position:fixed;left:16px;right:16px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:30;display:flex;gap:2px;padding:5px;background:color-mix(in srgb, var(--p-surface) 78%, transparent);backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);border:1px solid color-mix(in srgb, var(--p-border) 50%, transparent);border-radius:22px;box-shadow:0 4px 20px rgba(0,0,0,.10);animation:portalBarUp .34s cubic-bezier(.22,1,.36,1) both}
        @keyframes portalBarUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
        @media(min-width:761px){ .pmobnav{display:none} }`}</style>
      <nav className="pmobnav">
        {item("conversas", `/r/${token}/conversas`, "Conversas", <MessageCircle size={20} />)}
        {item("aguardando", `/r/${token}/conversas?tab=waiting`, "Aguardando", <Clock size={20} />)}
        {item("anuncios", `/r/${token}/conversas?tab=ads`, "Anúncios", <Megaphone size={20} />)}
        {quotesEnabled && item("orcamentos", `/r/${token}/revisao`, "Orçamentos", <FileText size={20} />, reviewCount)}
      </nav>
    </>
  );
}
