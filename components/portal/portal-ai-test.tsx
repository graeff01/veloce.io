"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Send, Sparkles, RotateCcw, FlaskConical, User, Mic, Square } from "lucide-react";

interface Artifact { kind: "image" | "pdf" | "audio" | "video"; url?: string; dataUri?: string; caption?: string; filename?: string }
interface Turn { role: "user" | "assistant"; content: string; decision?: string | null; tools?: string[]; artifacts?: Artifact[] }

// Cenários agrupados pra o gestor testar rápido como a IA reage — servem a qualquer vertical.
const SCENARIOS: { label: string; items: string[] }[] = [
  { label: "Primeiro contato", items: ["Oi, vi o anúncio", "Quero um orçamento"] },
  { label: "Objeções", items: ["Tá caro", "Faz desconto?", "Achei mais barato em outro lugar", "Só dando uma olhada"] },
  { label: "Dúvidas", items: ["Vocês instalam em Caxias?", "Parcela em quantas vezes?"] },
];

export function PortalAiTest({ token, assistantName }: { token: string; assistantName: string | null }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const name = assistantName || "IA";

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
        setTurns((t) => [...t, { role: "assistant", content: "— (a IA não responde isso: é caso de vendedor — em produção ela passa pro humano)", decision: d?.decision, tools: d?.tools, artifacts: d?.artifacts }]);
      } else {
        setTurns((t) => [...t, { role: "assistant", content: reply, decision: d?.decision, tools: d?.tools, artifacts: d?.artifacts }]);
      }
    } catch {
      setError("Falha de conexão. Tente de novo.");
    } finally { setLoading(false); }
  }

  // Envia um ÁUDIO gravado: a rota transcreve (Groq) e a IA responde (com voz, se ligada).
  async function sendAudio(blob: Blob) {
    if (loading) return;
    setError(null);
    const history = turns.map((t) => ({ role: t.role, content: t.content }));
    setTurns((t) => [...t, { role: "user", content: "🎤 …" }]);
    setLoading(true);
    try {
      const b64: string = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(blob); });
      const r = await fetch(`/api/portal/${token}/ai-test`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: b64, mime: blob.type || "audio/webm", transcript: history }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d?.error || "Falha ao processar o áudio."); setTurns((t) => t.slice(0, -1)); return; }
      // Substitui o placeholder pela transcrição (o que a IA entendeu) e adiciona a resposta.
      const said = (d?.transcription ?? "").toString().trim();
      setTurns((t) => { const u = t.slice(0, -1); u.push({ role: "user", content: said ? `🎤 ${said}` : "🎤 (áudio)" }); return u; });
      const reply = (d?.reply ?? "").toString().trim();
      if (!reply || reply.includes("[SKIP]")) {
        setTurns((t) => [...t, { role: "assistant", content: "— (a IA não responde isso: é caso de vendedor — em produção ela passa pro humano)", decision: d?.decision, tools: d?.tools, artifacts: d?.artifacts }]);
      } else {
        setTurns((t) => [...t, { role: "assistant", content: reply, decision: d?.decision, tools: d?.tools, artifacts: d?.artifacts }]);
      }
    } catch {
      setError("Falha ao enviar o áudio. Tente de novo."); setTurns((t) => t.slice(0, -1));
    } finally { setLoading(false); }
  }

  // Grava do microfone (toca uma vez pra começar, outra pra parar e enviar).
  async function toggleRecord() {
    if (loading) return;
    if (recording) { recRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        if (blob.size < 1200) { setError("Áudio muito curto — fala um pouquinho mais."); return; }
        void sendAudio(blob);
      };
      recRef.current = mr; mr.start(); setRecording(true); setError(null);
    } catch {
      setError("Não consegui acessar o microfone. Permita o acesso no navegador e tente de novo.");
    }
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(draft); } };

  return (
    <div className="ait-grid">
      <style>{`
        .ait-grid{display:grid;grid-template-columns:minmax(0,1fr) 336px;gap:16px;align-items:start}
        /* — coluna do chat — */
        .ait-chat{display:flex;flex-direction:column;height:min(74vh,780px)}
        .ait-chead{display:flex;align-items:center;gap:11px;padding:12px 16px;border-bottom:1px solid var(--p-border);flex-shrink:0}
        .ait-av{width:38px;height:38px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:var(--p-accent-soft);color:var(--p-accent)}
        .ait-chead h2{font-size:14px;font-weight:700;margin:0;letter-spacing:-.01em;color:var(--p-text);line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .ait-st{font-size:11.5px;color:var(--p-muted);display:flex;align-items:center;gap:5px;margin-top:2px}
        .ait-dot{width:7px;height:7px;border-radius:50%;background:var(--p-good);flex-shrink:0}
        .ait-reset{margin-left:auto;display:inline-flex;align-items:center;gap:6px;padding:7px 11px;border-radius:9px;border:1px solid var(--p-border);background:var(--p-bg);color:var(--p-muted);font-size:12px;font-weight:600;cursor:pointer;transition:color .15s,border-color .15s;flex-shrink:0}
        .ait-reset:hover{color:var(--p-text);border-color:var(--p-line-strong)}
        .ait-msgs{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:12px;background:var(--p-bg)}
        .ait-empty{margin:auto;text-align:center;color:var(--p-muted);max-width:330px;display:flex;flex-direction:column;align-items:center;gap:12px}
        .ait-empty .ec{width:54px;height:54px;border-radius:15px;display:flex;align-items:center;justify-content:center;background:var(--p-accent-soft);color:var(--p-accent)}
        .ait-empty p{margin:0;font-size:13.5px;line-height:1.55}
        .ait-row{display:flex}
        .ait-meta{display:flex;align-items:center;gap:5px;margin-bottom:4px;font-size:10px;font-weight:700;color:var(--p-muted);text-transform:uppercase;letter-spacing:.05em}
        .ait-bubble{padding:10px 13px;font-size:13.5px;line-height:1.5;white-space:pre-wrap;word-break:break-word}
        .ait-foot{margin-top:5px;display:flex;flex-wrap:wrap;gap:5px}
        .ait-fx{font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;background:var(--p-raise);color:var(--p-muted);letter-spacing:.02em}
        .ait-fx b{color:var(--p-text);font-weight:700}
        .ait-typing{display:inline-flex;gap:4px;align-items:center;padding:11px 15px;border-radius:4px 13px 13px 13px;background:var(--p-surface);border:1px solid var(--p-border)}
        .ait-typing i{width:6px;height:6px;border-radius:50%;background:var(--p-muted);opacity:.5;animation:aitb 1s infinite ease-in-out}
        .ait-typing i:nth-child(2){animation-delay:.15s}
        .ait-typing i:nth-child(3){animation-delay:.3s}
        @keyframes aitb{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:.9;transform:translateY(-3px)}}
        .ait-err{margin:0 14px;padding:8px 12px;font-size:12px;border-radius:9px;background:var(--p-crit-soft);color:var(--p-crit);border:1px solid color-mix(in srgb,var(--p-crit) 25%,transparent)}
        .ait-composer{display:flex;align-items:flex-end;gap:9px;padding:12px;border-top:1px solid var(--p-border);background:var(--p-surface);flex-shrink:0}
        .ait-ta{flex:1;resize:none;max-height:120px;min-height:44px;padding:12px 13px;border-radius:12px;border:1px solid var(--p-border);background:var(--p-bg);color:var(--p-text);font-size:14px;line-height:1.35;outline:none;font-family:inherit;transition:border-color .15s}
        .ait-ta:focus{border-color:var(--p-accent)}
        .ait-send{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;flex-shrink:0;border-radius:12px;border:none;background:var(--p-accent);color:var(--p-on-accent);cursor:pointer;transition:opacity .15s}
        .ait-send:disabled{opacity:.45;cursor:default}
        .ait-mic{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;flex-shrink:0;border-radius:12px;border:1px solid var(--p-border);background:var(--p-bg);color:var(--p-muted);cursor:pointer;transition:color .15s,border-color .15s,background .15s}
        .ait-mic:hover:not(:disabled){color:var(--p-accent);border-color:var(--p-accent)}
        .ait-mic:disabled{opacity:.45;cursor:default}
        /* — coluna de apoio — */
        .ait-rail{display:flex;flex-direction:column;gap:16px;position:sticky;top:16px}
        .ait-card{padding:16px 18px}
        .ait-card .ct{display:flex;align-items:center;gap:8px;margin-bottom:8px}
        .ait-card h3{font-size:12.5px;font-weight:700;margin:0;color:var(--p-text);letter-spacing:-.01em}
        .ait-card p{font-size:12.5px;line-height:1.55;color:var(--p-muted);margin:0}
        .ait-card p b{color:var(--p-text);font-weight:600}
        .ait-grp{margin-top:14px}
        .ait-grp .gl{font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--p-muted);margin-bottom:8px}
        .ait-chips{display:flex;flex-wrap:wrap;gap:6px}
        .ait-chip{padding:6px 11px;font-size:12px;border-radius:9px;border:1px solid var(--p-border);background:var(--p-bg);color:var(--p-text);cursor:pointer;transition:border-color .15s,color .15s,background .15s;text-align:left}
        .ait-chip:hover:not(:disabled){border-color:var(--p-accent);color:var(--p-accent);background:var(--p-accent-soft)}
        .ait-chip:disabled{opacity:.5;cursor:default}
        @media(max-width:920px){.ait-grid{grid-template-columns:1fr}.ait-chat{height:min(62vh,540px);order:-1}.ait-rail{position:static}}
      `}</style>

      {/* ── Chat ─────────────────────────────────────────────── */}
      <section className="p-panel ait-chat">
        <header className="ait-chead">
          <div className="ait-av"><Sparkles size={19} /></div>
          <div style={{ minWidth: 0 }}>
            <h2>{name}</h2>
            <div className="ait-st"><span className="ait-dot" /> Assistente virtual · modo simulação</div>
          </div>
          {turns.length > 0 && (
            <button type="button" className="ait-reset" onClick={() => { setTurns([]); setError(null); }}>
              <RotateCcw size={14} /> Recomeçar
            </button>
          )}
        </header>

        <div ref={scrollRef} className="ait-msgs">
          {turns.length === 0 && (
            <div className="ait-empty">
              <div className="ec"><Sparkles size={24} /></div>
              <p>Escreva como um lead escreveria — ou toque num cenário ao lado. A {name} responde exatamente como no atendimento real.</p>
            </div>
          )}

          {turns.map((t, i) => {
            const mine = t.role === "user";
            // Resposta em VOZ: mostra só a nota de voz (esconde o texto) — como no WhatsApp real.
            const hasAudio = !mine && !!t.artifacts?.some((a) => a.kind === "audio");
            return (
              <div key={i} className="ait-row" style={{ justifyContent: mine ? "flex-end" : "flex-start" }}>
                <div style={{ maxWidth: "84%" }}>
                  <div className="ait-meta" style={{ justifyContent: mine ? "flex-end" : "flex-start" }}>
                    {mine ? <>Lead <User size={11} /></> : <><Sparkles size={11} style={{ color: "var(--p-accent)" }} /> {name}</>}
                  </div>
                  {!hasAudio && (
                  <div
                    className="ait-bubble"
                    style={{
                      borderRadius: mine ? "13px 4px 13px 13px" : "4px 13px 13px 13px",
                      background: mine ? "var(--p-accent)" : "var(--p-surface)",
                      color: mine ? "var(--p-on-accent)" : "var(--p-text)",
                      border: mine ? "none" : "1px solid var(--p-border)",
                    }}
                  >
                    {t.content}
                  </div>
                  )}
                  {!mine && t.artifacts?.map((a, j) => (
                    a.kind === "audio"
                      ? <audio key={j} controls src={a.url || a.dataUri} style={{ display: "block", marginTop: 6, maxWidth: 250, width: "100%" }} />
                      : a.kind === "image"
                      ? <a key={j} href={a.url || a.dataUri} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 6 }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={a.url || a.dataUri} alt={a.caption || "foto"} style={{ maxWidth: 220, width: "100%", borderRadius: 12, display: "block", border: "1px solid var(--p-border)" }} />
                        </a>
                      : a.kind === "video"
                      ? <video key={j} controls src={a.url || a.dataUri} style={{ display: "block", marginTop: 6, maxWidth: 250, width: "100%", borderRadius: 12, border: "1px solid var(--p-border)" }} />
                      : <a key={j} href={a.dataUri || a.url} download={a.filename || "orcamento.pdf"} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, padding: "10px 12px", borderRadius: 12, border: "1px solid var(--p-border)", background: "var(--p-surface)", textDecoration: "none", color: "var(--p-text)", fontSize: 13, fontWeight: 600, maxWidth: 250 }}>
                          <span style={{ fontSize: 18 }}>📄</span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.caption || a.filename || "Orçamento.pdf"}</span>
                        </a>
                  ))}
                  {!mine && (t.decision || (t.tools && t.tools.length > 0)) && (
                    <div className="ait-foot">
                      {t.decision && <span className="ait-fx">decisão: <b>{t.decision}</b></span>}
                      {t.tools && t.tools.length > 0 && <span className="ait-fx">ações: <b>{t.tools.join(", ")}</b></span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="ait-row" style={{ justifyContent: "flex-start" }}>
              <div className="ait-typing" aria-label="digitando"><i /><i /><i /></div>
            </div>
          )}
        </div>

        {error && <div role="alert" className="ait-err" style={{ marginTop: 10 }}>{error}</div>}

        <div className="ait-composer">
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); const el = e.target; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 120) + "px"; }}
            onKeyDown={onKey}
            rows={1}
            placeholder="Escreva como um lead…"
            disabled={loading}
            className="ait-ta"
          />
          <button type="button" onClick={() => void toggleRecord()} disabled={loading} aria-label={recording ? "Parar e enviar" : "Gravar áudio"} title={recording ? "Parar e enviar" : "Gravar um áudio (testar a IA respondendo em voz)"} className="ait-mic" style={recording ? { background: "var(--p-crit)", color: "#fff", borderColor: "transparent" } : undefined}>
            {recording ? <Square size={16} /> : <Mic size={18} />}
          </button>
          <button type="button" onClick={() => void send(draft)} disabled={loading || !draft.trim()} aria-label="Enviar" className="ait-send">
            <Send size={18} />
          </button>
        </div>
      </section>

      {/* ── Apoio ────────────────────────────────────────────── */}
      <aside className="ait-rail">
        <div className="p-panel ait-card">
          <div className="ct"><FlaskConical size={15} style={{ color: "var(--p-accent)" }} /><h3>Sobre este teste</h3></div>
          <p>A {name} responde igual ao WhatsApp real. <b>Nada é enviado</b> a clientes e <b>nada fica gravado</b> — é uma simulação segura para você conferir o atendimento.</p>
        </div>

        <div className="p-panel ait-card">
          <div className="ct"><h3>Cenários para testar</h3></div>
          <p>Toque em um para enviar como lead.</p>
          {SCENARIOS.map((g) => (
            <div className="ait-grp" key={g.label}>
              <div className="gl">{g.label}</div>
              <div className="ait-chips">
                {g.items.map((q) => (
                  <button type="button" key={q} className="ait-chip" disabled={loading} onClick={() => void send(q)}>{q}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
