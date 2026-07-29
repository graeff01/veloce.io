"use client";

import { useEffect, useState } from "react";

const KEY = "veloce-cookie-consent";

// Banner de consentimento de cookies (LGPD). Aparece uma vez por navegador; a escolha fica
// no localStorage. Cores fixas (barra escura) — legível em qualquer tela (admin ou portal).
export function CookieConsent() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try { if (!localStorage.getItem(KEY)) setShow(true); } catch { /* sem localStorage */ }
  }, []);
  if (!show) return null;
  const accept = () => { try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ } setShow(false); };
  return (
    <div role="dialog" aria-label="Aviso de cookies"
      style={{ position: "fixed", left: 12, right: 12, bottom: "calc(12px + env(safe-area-inset-bottom))", zIndex: 90, maxWidth: 560, margin: "0 auto", background: "#111827", color: "#e5e7eb", borderRadius: 14, padding: "13px 16px", boxShadow: "0 10px 40px rgba(0,0,0,.35)", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", fontFamily: "system-ui, -apple-system, sans-serif", fontSize: 13, lineHeight: 1.5 }}>
      <span style={{ flex: 1, minWidth: 200 }}>
        Usamos cookies essenciais para o funcionamento e a segurança da plataforma.{" "}
        <a href="/cookies" style={{ color: "#a5b4fc", textDecoration: "underline" }}>Saiba mais</a>.
      </span>
      <button onClick={accept}
        style={{ background: "#4F46E5", color: "#fff", border: "none", borderRadius: 9, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
        Aceitar
      </button>
    </div>
  );
}
