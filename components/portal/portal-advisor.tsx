"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";

interface AdvisorItem { icon: string; q: string; a: string; tip?: string }
interface AdvisorReply { greeting: string; items: AdvisorItem[] }
interface Msg { role: "bot" | "user"; text: string; tip?: string }

// Consultor Veloce — assistente flutuante do portal do cliente. Determinístico
// (respostas vêm do endpoint /advisor, sem LLM). Animações: pulso do botão
// (permanência), entrada (scale+fade) e saída do painel.
export function PortalAdvisor({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [data, setData] = useState<AdvisorReply | null>(null);
  const [loading, setLoading] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [nudge, setNudge] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // Cutucada de atenção (permanência) — aparece uma vez, some ao abrir.
  useEffect(() => {
    const t = setTimeout(() => setNudge(true), 2600);
    const h = setTimeout(() => setNudge(false), 11000);
    return () => { clearTimeout(t); clearTimeout(h); };
  }, []);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [msgs, open]);

  async function openPanel() {
    setNudge(false);
    setOpen(true);
    if (!data) {
      setLoading(true);
      try {
        const r = await fetch(`/api/portal/${token}/advisor`);
        const d: AdvisorReply = await r.json();
        setData(d);
        setMsgs([{ role: "bot", text: d.greeting }]);
      } catch {
        setMsgs([{ role: "bot", text: "Não consegui carregar seus números agora. Tente de novo em instantes." }]);
      } finally {
        setLoading(false);
      }
    }
  }

  function closePanel() {
    setClosing(true);
    setTimeout(() => { setOpen(false); setClosing(false); }, 200);
  }

  function ask(it: AdvisorItem) {
    setMsgs((m) => [...m, { role: "user", text: it.q }, { role: "bot", text: it.a, tip: it.tip }]);
  }

  return (
    <>
      <style>{`
        @keyframes advPulse { 0% { transform: scale(1); opacity: .55 } 70% { transform: scale(1.9); opacity: 0 } 100% { opacity: 0 } }
        @keyframes advBob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }
        @keyframes advIn { 0% { opacity: 0; transform: translateY(16px) scale(.92) } 100% { opacity: 1; transform: translateY(0) scale(1) } }
        @keyframes advOut { 0% { opacity: 1; transform: translateY(0) scale(1) } 100% { opacity: 0; transform: translateY(16px) scale(.92) } }
        @keyframes advMsg { 0% { opacity: 0; transform: translateY(8px) } 100% { opacity: 1; transform: translateY(0) } }
        @keyframes advNudge { 0% { opacity: 0; transform: translateX(10px) } 100% { opacity: 1; transform: translateX(0) } }
        .adv-fab { animation: advBob 3.4s ease-in-out infinite }
        .adv-panel-in { animation: advIn .26s cubic-bezier(.22,1,.36,1) both }
        .adv-panel-out { animation: advOut .2s ease-in both }
        .adv-msg { animation: advMsg .28s cubic-bezier(.22,1,.36,1) both }
        @media (prefers-reduced-motion: reduce) { .adv-fab,.adv-panel-in,.adv-panel-out,.adv-msg { animation: none !important } }
      `}</style>

      {/* Painel */}
      {(open || closing) && (
        <div
          className={closing ? "adv-panel-out" : "adv-panel-in"}
          style={{ position: "fixed", right: 20, bottom: 92, zIndex: 60, width: "min(370px, calc(100vw - 32px))", height: "min(560px, calc(100dvh - 140px))", background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 20, boxShadow: "0 12px 48px rgba(0,0,0,.22)", display: "flex", flexDirection: "column", overflow: "hidden", transformOrigin: "bottom right" }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", background: "linear-gradient(120deg, var(--p-accent-soft), var(--p-surface) 70%)", borderBottom: "1px solid var(--p-border)" }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "var(--p-accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Sparkles size={17} style={{ color: "var(--p-on-accent)" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--p-text)", lineHeight: 1.1 }}>Consultor Veloce</div>
              <div style={{ fontSize: 11, color: "var(--p-muted)", display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#16a34a" }} /> online agora
              </div>
            </div>
            <button onClick={closePanel} aria-label="Fechar" style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--p-muted)", padding: 4, display: "flex" }}><X size={18} /></button>
          </div>

          {/* Transcrição */}
          <div ref={bodyRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px", display: "flex", flexDirection: "column", gap: 10, background: "var(--p-bg)" }}>
            {loading && <div style={{ fontSize: 12.5, color: "var(--p-muted)" }}>Carregando seus números…</div>}
            {msgs.map((m, i) => (
              <div key={i} className="adv-msg" style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "86%" }}>
                <div style={{ fontSize: 13.5, lineHeight: 1.5, padding: "9px 12px", borderRadius: 14, borderTopLeftRadius: m.role === "bot" ? 4 : 14, borderTopRightRadius: m.role === "user" ? 4 : 14, background: m.role === "user" ? "var(--p-accent)" : "var(--p-surface)", color: m.role === "user" ? "var(--p-on-accent)" : "var(--p-text)", border: m.role === "bot" ? "1px solid var(--p-border)" : "none", fontWeight: m.role === "user" ? 600 : 400 }}>
                  {m.text}
                </div>
                {m.tip && (
                  <div className="adv-msg" style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.45, padding: "8px 11px", borderRadius: 12, background: "var(--p-accent-soft)", color: "var(--p-text)" }}>
                    💡 {m.tip}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Perguntas sugeridas */}
          {data && (
            <div style={{ borderTop: "1px solid var(--p-border)", padding: "10px 12px", background: "var(--p-surface)", display: "flex", gap: 7, flexWrap: "wrap", maxHeight: 132, overflowY: "auto" }}>
              {data.items.map((it, i) => (
                <button key={i} onClick={() => ask(it)} style={{ fontSize: 12, fontWeight: 600, color: "var(--p-text)", background: "var(--p-bg)", border: "1px solid var(--p-border)", borderRadius: 99, padding: "6px 11px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span>{it.icon}</span> {it.q}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cutucada */}
      {nudge && !open && (
        <div style={{ position: "fixed", right: 88, bottom: 30, zIndex: 55, background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,.16)", padding: "9px 13px", maxWidth: 210, animation: "advNudge .3s ease both" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--p-text)" }}>Fale com seu consultor 👋</div>
          <div style={{ fontSize: 11.5, color: "var(--p-muted)", marginTop: 2 }}>Pergunte sobre seus resultados.</div>
        </div>
      )}

      {/* Botão flutuante (FAB) com pulso */}
      {!open && (
        <button onClick={openPanel} aria-label="Abrir consultor" style={{ position: "fixed", right: 20, bottom: 20, zIndex: 55, width: 58, height: 58, borderRadius: "50%", border: "none", cursor: "pointer", background: "var(--p-accent)", boxShadow: "0 8px 26px rgba(0,0,0,.24)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--p-accent)", animation: "advPulse 2.4s ease-out infinite" }} />
          <span className="adv-fab" style={{ display: "flex", position: "relative" }}><Sparkles size={24} style={{ color: "var(--p-on-accent)" }} /></span>
        </button>
      )}
    </>
  );
}
