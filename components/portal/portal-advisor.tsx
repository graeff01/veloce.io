"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, X, ChevronRight } from "lucide-react";

interface AdvisorItem { icon: string; q: string; a: string; tip?: string }
interface AdvisorReply { greeting: string; items: AdvisorItem[] }
interface Msg { role: "bot" | "user"; text: string; tip?: string }

// Consultor Veloce — assistente flutuante do portal do cliente. Determinístico
// (respostas vêm do endpoint /advisor, sem LLM). Animações: pulso do botão
// (permanência), entrada (scale+fade) e saída do painel + entrada das perguntas.
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
        @keyframes advPulse { 0% { transform: scale(1); opacity: .5 } 70% { transform: scale(2); opacity: 0 } 100% { opacity: 0 } }
        @keyframes advBob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }
        @keyframes advIn { 0% { opacity: 0; transform: translateY(18px) scale(.9) } 100% { opacity: 1; transform: translateY(0) scale(1) } }
        @keyframes advOut { 0% { opacity: 1; transform: translateY(0) scale(1) } 100% { opacity: 0; transform: translateY(18px) scale(.9) } }
        @keyframes advMsg { 0% { opacity: 0; transform: translateY(9px) } 100% { opacity: 1; transform: translateY(0) } }
        @keyframes advRow { 0% { opacity: 0; transform: translateY(10px) } 100% { opacity: 1; transform: translateY(0) } }
        @keyframes advNudge { 0% { opacity: 0; transform: translateX(10px) } 100% { opacity: 1; transform: translateX(0) } }
        @keyframes advDot { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
        .adv-fab { animation: advBob 3.4s ease-in-out infinite }
        .adv-panel-in { animation: advIn .28s cubic-bezier(.22,1,.36,1) both }
        .adv-panel-out { animation: advOut .2s ease-in both }
        .adv-msg { animation: advMsg .3s cubic-bezier(.22,1,.36,1) both }
        .adv-row { animation: advRow .34s cubic-bezier(.22,1,.36,1) both }
        .adv-row:hover { background: var(--p-bg) !important; transform: translateX(2px) }
        .adv-dot { animation: advDot 1.6s ease-in-out infinite }
        @media (prefers-reduced-motion: reduce) { .adv-fab,.adv-panel-in,.adv-panel-out,.adv-msg,.adv-row,.adv-dot { animation: none !important } }
      `}</style>

      {/* Painel */}
      {(open || closing) && (
        <div
          className={closing ? "adv-panel-out" : "adv-panel-in"}
          style={{ position: "fixed", right: 20, bottom: 94, zIndex: 60, width: "min(384px, calc(100vw - 32px))", height: "min(600px, calc(100dvh - 140px))", background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 22, boxShadow: "0 18px 60px rgba(0,0,0,.28)", display: "flex", flexDirection: "column", overflow: "hidden", transformOrigin: "bottom right" }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "14px 15px", background: "linear-gradient(135deg, var(--p-accent-soft), var(--p-surface) 72%)", borderBottom: "1px solid var(--p-border)", position: "relative" }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(140deg, var(--p-accent), color-mix(in srgb, var(--p-accent) 70%, #000 12%))", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 6px 16px color-mix(in srgb, var(--p-accent) 45%, transparent)" }}>
              <Sparkles size={19} style={{ color: "var(--p-on-accent)" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: "var(--p-text)", lineHeight: 1.1, letterSpacing: "-0.01em" }}>Consultor Veloce</div>
              <div style={{ fontSize: 11.5, color: "var(--p-muted)", display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                <span className="adv-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "#16a34a" }} /> online · responde na hora
              </div>
            </div>
            <button onClick={closePanel} aria-label="Fechar" style={{ background: "var(--p-bg)", border: "1px solid var(--p-border)", cursor: "pointer", color: "var(--p-muted)", padding: 5, display: "flex", borderRadius: 9 }}><X size={16} /></button>
          </div>

          {/* Transcrição */}
          <div ref={bodyRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "15px", display: "flex", flexDirection: "column", gap: 11, background: "var(--p-bg)" }}>
            {loading && <div style={{ fontSize: 12.5, color: "var(--p-muted)" }}>Carregando seus números…</div>}
            {msgs.map((m, i) => (
              <div key={i} className="adv-msg" style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%" }}>
                <div style={{ fontSize: 13.5, lineHeight: 1.5, padding: "10px 13px", borderRadius: 16, borderTopLeftRadius: m.role === "bot" ? 5 : 16, borderTopRightRadius: m.role === "user" ? 5 : 16, background: m.role === "user" ? "var(--p-accent)" : "var(--p-surface)", color: m.role === "user" ? "var(--p-on-accent)" : "var(--p-text)", border: m.role === "bot" ? "1px solid var(--p-border)" : "none", fontWeight: m.role === "user" ? 600 : 400, boxShadow: m.role === "bot" ? "0 2px 8px rgba(0,0,0,.04)" : "none" }}>
                  {m.text}
                </div>
                {m.tip && (
                  <div className="adv-msg" style={{ marginTop: 7, fontSize: 12.5, lineHeight: 1.45, padding: "9px 12px", borderRadius: 13, background: "var(--p-accent-soft)", color: "var(--p-text)", fontWeight: 500 }}>
                    💡 {m.tip}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Perguntas sugeridas — linhas grandes com ícone (foco visual) */}
          {data && (
            <div style={{ borderTop: "1px solid var(--p-border)", padding: "11px 12px 12px", background: "var(--p-surface)", maxHeight: 236, overflowY: "auto" }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", color: "var(--p-muted)", padding: "0 4px 8px" }}>Pergunte ao seu consultor</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {data.items.map((it, i) => (
                  <button
                    key={i}
                    onClick={() => ask(it)}
                    className="adv-row"
                    style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left", padding: "9px 11px", borderRadius: 13, border: "1px solid var(--p-border)", background: "var(--p-surface)", cursor: "pointer", transition: "background .16s, transform .16s", animationDelay: `${0.04 * i}s` }}
                  >
                    <span style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 10, background: "var(--p-accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{it.icon}</span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--p-text)", lineHeight: 1.25 }}>{it.q}</span>
                    <ChevronRight size={16} style={{ color: "var(--p-muted)", flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cutucada */}
      {nudge && !open && (
        <div style={{ position: "fixed", right: 90, bottom: 32, zIndex: 55, background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 13, boxShadow: "0 8px 24px rgba(0,0,0,.16)", padding: "10px 14px", maxWidth: 214, animation: "advNudge .3s ease both" }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--p-text)" }}>Fale com seu consultor 👋</div>
          <div style={{ fontSize: 11.5, color: "var(--p-muted)", marginTop: 2 }}>Pergunte sobre seus resultados.</div>
        </div>
      )}

      {/* Botão flutuante (FAB) com pulso + brilho */}
      {!open && (
        <button onClick={openPanel} aria-label="Abrir consultor" style={{ position: "fixed", right: 20, bottom: 20, zIndex: 55, width: 60, height: 60, borderRadius: "50%", border: "none", cursor: "pointer", background: "linear-gradient(140deg, var(--p-accent), color-mix(in srgb, var(--p-accent) 72%, #000 14%))", boxShadow: "0 10px 30px color-mix(in srgb, var(--p-accent) 42%, transparent), 0 4px 12px rgba(0,0,0,.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--p-accent)", animation: "advPulse 2.4s ease-out infinite" }} />
          <span className="adv-fab" style={{ display: "flex", position: "relative" }}><Sparkles size={25} style={{ color: "var(--p-on-accent)" }} /></span>
        </button>
      )}
    </>
  );
}
