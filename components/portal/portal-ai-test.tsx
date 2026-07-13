"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Send, Sparkles, RotateCcw, FlaskConical, User } from "lucide-react";

interface Turn { role: "user" | "assistant"; content: string; decision?: string | null; tools?: string[] }

// Objeções/perguntas comuns pra o gestor testar rápido como a IA reage.
const QUICK = ["Oi, vi o anúncio", "Tá caro", "Faz desconto?", "Achei mais barato em outro lugar", "Só dando uma olhada", "Vocês instalam em Caxias?", "Parcela em quantas vezes?", "Quero um orçamento"];

export function PortalAiTest({ token, assistantName }: { token: string; assistantName: string | null }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [turns, loading]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || loading) return;
    setError(null);
    const history = turns.map((t) => ({ role: t.role, content: t.content }));
    setTurns((t) => [...t, { role: "user", content: msg }]);
    setDraft("");
    if (taRef.current) taRef.current.style.height = "auto";
    setLoading(true);
    try {
      const r = await fetch(`/api/portal/${token}/ai-test`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, transcript: history }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d?.error || "Falha ao gerar a resposta."); return; }
      const reply = (d?.reply ?? "").toString().trim();
      if (!reply || reply.includes("[SKIP]")) {
        setTurns((t) => [...t, { role: "assistant", content: "— (a IA não responde isso: é caso de vendedor — em produção ela passa pro humano)", decision: d?.decision, tools: d?.tools }]);
      } else {
        setTurns((t) => [...t, { role: "assistant", content: reply, decision: d?.decision, tools: d?.tools }]);
      }
    } catch {
      setError("Falha de conexão. Tente de novo.");
    } finally { setLoading(false); }
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(draft); } };

  return (
    <div className="p-panel" style={{ display: "flex", flexDirection: "column", overflow: "hidden", maxWidth: 760 }}>
      {/* aviso */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "12px 16px", background: "var(--p-accent-soft)", borderBottom: "1px solid var(--p-border)" }}>
        <FlaskConical size={16} style={{ color: "var(--p-accent)", flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12.5, color: "var(--p-text)", lineHeight: 1.45 }}>
          <b>Simulação de atendimento.</b> Digite como se fosse um lead — a IA responde igual à produção. Nada é enviado no WhatsApp e nada fica gravado. {assistantName ? `Você está falando com a ${assistantName}.` : ""}
        </div>
      </div>

      {/* mensagens */}
      <div ref={scrollRef} style={{ flex: 1, minHeight: 320, maxHeight: "58vh", overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10, background: "var(--p-bg)" }}>
        {turns.length === 0 && (
          <div style={{ margin: "auto", textAlign: "center", color: "var(--p-muted)", fontSize: 13, maxWidth: 360 }}>
            <Sparkles size={26} style={{ color: "var(--p-accent)", opacity: 0.8 }} />
            <p style={{ marginTop: 10 }}>Mande uma mensagem como um lead mandaria. Teste as objeções mais comuns e veja como a IA qualifica e responde.</p>
          </div>
        )}
        {turns.map((t, i) => {
          const mine = t.role === "user";
          return (
            <div key={i} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "82%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3, justifyContent: mine ? "flex-end" : "flex-start", fontSize: 10.5, fontWeight: 700, color: "var(--p-muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>
                  {mine ? <>Lead <User size={11} /></> : <><Sparkles size={11} style={{ color: "var(--p-accent)" }} /> {assistantName || "IA"}</>}
                </div>
                <div style={{ padding: "9px 12px", fontSize: 13.5, lineHeight: 1.45, whiteSpace: "pre-wrap", borderRadius: mine ? "12px 3px 12px 12px" : "3px 12px 12px 12px", background: mine ? "var(--p-accent)" : "var(--p-surface)", color: mine ? "var(--p-on-accent)" : "var(--p-text)", border: mine ? "none" : "1px solid var(--p-border)" }}>
                  {t.content}
                </div>
                {!mine && (t.decision || (t.tools && t.tools.length > 0)) && (
                  <div style={{ marginTop: 4, fontSize: 10.5, color: "var(--p-muted)" }}>
                    {t.decision ? `decisão: ${t.decision}` : ""}{t.tools && t.tools.length ? ` · ações: ${t.tools.join(", ")}` : ""}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ padding: "9px 14px", borderRadius: "3px 12px 12px 12px", background: "var(--p-surface)", border: "1px solid var(--p-border)", color: "var(--p-muted)", fontSize: 13 }}>digitando…</div>
          </div>
        )}
      </div>

      {/* sugestões rápidas */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "10px 12px 0" }}>
        {QUICK.map((q) => (
          <button key={q} onClick={() => void send(q)} disabled={loading} style={{ padding: "4px 10px", fontSize: 11.5, borderRadius: 20, border: "1px solid var(--p-border)", background: "var(--p-bg)", color: "var(--p-text)", cursor: loading ? "default" : "pointer", opacity: loading ? 0.5 : 1 }}>{q}</button>
        ))}
      </div>

      {error && <div role="alert" style={{ margin: "8px 12px 0", padding: "6px 10px", fontSize: 12, borderRadius: 8, background: "color-mix(in srgb, #d6453d 12%, transparent)", color: "#d6453d" }}>{error}</div>}

      {/* compositor */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, padding: 12 }}>
        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); const el = e.target; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 120) + "px"; }}
          onKeyDown={onKey}
          rows={1}
          placeholder="Escreva como um lead…"
          disabled={loading}
          style={{ flex: 1, resize: "none", maxHeight: 120, minHeight: 42, padding: "11px 12px", borderRadius: 12, border: "1px solid var(--p-border)", background: "var(--p-bg)", color: "var(--p-text)", fontSize: 14, lineHeight: 1.35, outline: "none", fontFamily: "inherit" }}
        />
        <button onClick={() => void send(draft)} disabled={loading || !draft.trim()} aria-label="Enviar" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 42, height: 42, flexShrink: 0, borderRadius: "50%", border: "none", background: "var(--p-accent)", color: "var(--p-on-accent)", cursor: loading || !draft.trim() ? "default" : "pointer", opacity: loading || !draft.trim() ? 0.5 : 1 }}>
          <Send size={17} />
        </button>
        {turns.length > 0 && (
          <button onClick={() => { setTurns([]); setError(null); }} title="Recomeçar" aria-label="Recomeçar" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 42, height: 42, flexShrink: 0, borderRadius: 12, border: "1px solid var(--p-border)", background: "var(--p-bg)", color: "var(--p-muted)", cursor: "pointer" }}>
            <RotateCcw size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
