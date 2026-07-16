"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ShieldCheck, FileText, MapPin, Bell, Check, Loader2, X, Send } from "lucide-react";

interface Line { label: string; amount: number }
interface Review {
  quoteId: string; number: number; contactId: string; name: string;
  total: number; currency: string; summary: string | null; resumo: string | null;
  city: string | null; nome: string | null; lines: Line[]; submittedAt: string;
}

const brl = (v: number | null, cur: string) => v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: cur || "BRL" });

function haAgo(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `há ${h}h` : `há ${Math.floor(h / 24)}d`;
}

// Bip curto (Web Audio) — sem arquivo externo (a CSP bloqueia mídia remota).
function beep() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "sine"; o.frequency.value = 760;
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    o.start(); o.stop(ctx.currentTime + 0.36);
    o.onended = () => ctx.close();
  } catch { /* silencioso */ }
}

export function PortalRevisao({ token }: { token: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notif, setNotif] = useState<"default" | "granted" | "denied">("default");
  const [desc, setDesc] = useState<Record<string, string>>({}); // desconto digitado por quote
  const seen = useRef<Set<string>>(new Set());
  const first = useRef(true);

  useEffect(() => { if (typeof Notification !== "undefined") setNotif(Notification.permission as typeof notif); }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/portal/${token}/quote-reviews`, { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      const list: Review[] = d?.reviews ?? [];
      const novos = list.filter((q) => !seen.current.has(q.quoteId));
      list.forEach((q) => seen.current.add(q.quoteId));
      if (!first.current && novos.length) {
        beep();
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          const q = novos[0];
          new Notification("📋 Orçamento aguardando sua conferência", {
            body: `${q.name} · ${brl(q.total, q.currency)}${q.city ? ` · ${q.city}` : ""}`,
            tag: "quote-review",
          });
        }
      }
      first.current = false;
      setReviews(list); setLoaded(true);
    } catch { /* ignora */ }
  }, [token]);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, [load]);

  async function aprovar(q: Review) {
    const d = Math.max(0, Number((desc[q.quoteId] || "").replace(",", ".")) || 0);
    if (d > 0 && !confirm(`Aprovar com desconto de ${brl(d, q.currency)}? O cliente recebe ${brl(Math.max(0, q.total - d), q.currency)}.`)) return;
    setBusy(q.quoteId);
    try {
      const r = await fetch(`/api/portal/${token}/quote-reviews/${q.quoteId}/approve`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ desconto: d }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.ok) { load(); return; }
      alert(j?.error || "Não consegui enviar o orçamento. Tente de novo.");
      load();
    } catch { alert("Falha de conexão. Tente de novo."); }
    finally { setBusy(null); }
  }

  async function rejeitar(q: Review) {
    // Pede o motivo — vira APRENDIZADO ("o que a IA errou") e ainda serve de confirmação.
    const motivo = window.prompt(`Rejeitar e assumir a conversa de ${q.name}.\n\nO que a IA errou? (ex: "modelo errado", "frete de outra cidade") — opcional, mas ensina a IA a não repetir.`);
    if (motivo === null) return; // cancelou
    setBusy(q.quoteId);
    try {
      const r = await fetch(`/api/portal/${token}/quote-reviews/${q.quoteId}/reject`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ motivo }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.ok) { window.location.href = `/r/${token}/conversas?c=${j.contactId || q.contactId}`; return; }
      alert(j?.error || "Não consegui rejeitar. Tente de novo.");
      load();
    } catch { alert("Falha de conexão. Tente de novo."); }
    finally { setBusy(null); }
  }

  async function askNotif() {
    if (typeof Notification === "undefined") return;
    setNotif((await Notification.requestPermission()) as typeof notif);
  }

  return (
    <div className="rwrap">
      <style>{`
        .rwrap{max-width:920px;margin:0 auto;padding:26px 22px 70px}
        .rhead{display:flex;align-items:center;gap:12px;margin-bottom:6px}
        .rhead h1{font-size:20px;margin:0;letter-spacing:-.01em}
        .rcount{background:var(--p-accent);color:var(--p-on-accent);font-size:12px;font-weight:700;border-radius:999px;padding:2px 9px;min-width:22px;text-align:center}
        .rsub{color:var(--p-muted);font-size:13px;margin:0 0 18px;line-height:1.5}
        .rnotif{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;border:1px solid var(--p-border);background:var(--p-surface);color:var(--p-muted);border-radius:9px;padding:7px 12px;cursor:pointer;margin-bottom:20px}
        .rnotif.on{color:var(--p-good);border-color:color-mix(in srgb,var(--p-good) 40%,transparent);cursor:default}
        .rcards{display:flex;flex-direction:column;gap:13px}
        .rcard{border:1px solid var(--p-border);background:var(--p-surface);border-radius:14px;padding:16px 18px;border-left:3px solid var(--p-accent)}
        .rtop{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap}
        .ric{width:40px;height:40px;border-radius:11px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:var(--p-accent-soft);color:var(--p-accent)}
        .rbody{flex:1;min-width:180px}
        .rname{font-size:15px;font-weight:700;color:var(--p-text)}
        .rwants{font-size:13.5px;font-weight:600;color:var(--p-text);margin-top:2px}
        .rresumo{font-size:12.5px;color:var(--p-muted);margin-top:5px;background:var(--p-bg);border:1px solid var(--p-border);border-radius:7px;padding:5px 9px;display:inline-block}
        .rmeta{font-size:12.5px;color:var(--p-muted);margin-top:6px;display:flex;gap:12px;flex-wrap:wrap;align-items:center}
        .rval{font-size:19px;font-weight:800;color:var(--p-accent);white-space:nowrap;text-align:right}
        .rlines{margin:12px 0 0;border-top:1px dashed var(--p-border);padding-top:10px;display:flex;flex-direction:column;gap:3px}
        .rline{display:flex;justify-content:space-between;font-size:12.5px;color:var(--p-muted)}
        .rline b{color:var(--p-text);font-weight:600}
        .ract{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-top:14px}
        .rpdf{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--p-border);color:var(--p-text);background:var(--p-bg);border-radius:9px;padding:9px 13px;font-size:13px;font-weight:600;text-decoration:none}
        .rdisc{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--p-muted)}
        .rdisc input{width:92px;border:1px solid var(--p-border);background:var(--p-surface);color:var(--p-text);border-radius:8px;padding:8px 10px;font-size:13px;font-family:inherit}
        .rappr{display:inline-flex;align-items:center;gap:7px;background:var(--p-accent);color:var(--p-on-accent);border:none;border-radius:9px;padding:10px 16px;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit;margin-left:auto}
        .rappr:disabled{opacity:.6;cursor:default}
        .rrej{display:inline-flex;align-items:center;gap:6px;border:1px solid color-mix(in srgb,var(--p-crit) 45%,transparent);color:var(--p-crit);background:transparent;border-radius:9px;padding:9px 13px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}
        .rempty{text-align:center;color:var(--p-muted);padding:50px 20px}
        .rempty .ei{width:56px;height:56px;border-radius:15px;background:var(--p-accent-soft);color:var(--p-accent);display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px}
      `}</style>

      <div className="rhead">
        <h1>Revisão de orçamentos</h1>
        {reviews.length > 0 && <span className="rcount">{reviews.length}</span>}
      </div>
      <p className="rsub">Nenhum orçamento vai ao cliente sem o seu aval. Confira o PDF, ajuste um desconto se quiser e <b>aprove para enviar</b> — ou rejeite e assuma a conversa.</p>

      {notif !== "granted" ? (
        <button className="rnotif" onClick={askNotif}><Bell size={14} /> Ativar aviso na tela quando chegar um orçamento pra revisar</button>
      ) : (
        <div className="rnotif on"><Check size={14} /> Avisos ativados — você é alertado mesmo com a aba em segundo plano</div>
      )}

      {!loaded ? (
        <div className="rempty"><Loader2 size={22} className="animate-spin" /></div>
      ) : reviews.length === 0 ? (
        <div className="rempty">
          <div className="ei"><ShieldCheck size={26} /></div>
          <div style={{ fontSize: 14 }}>Nenhum orçamento aguardando revisão.</div>
          <div style={{ fontSize: 12.5, marginTop: 4 }}>Quando a IA montar um orçamento, ele aparece aqui para o seu aval antes de ir ao cliente. 🛡️</div>
        </div>
      ) : (
        <div className="rcards">
          {reviews.map((q) => {
            const d = Math.max(0, Number((desc[q.quoteId] || "").replace(",", ".")) || 0);
            const efetivo = Math.max(0, q.total - d);
            return (
              <div key={q.quoteId} className="rcard">
                <div className="rtop">
                  <div className="ric"><FileText size={20} /></div>
                  <div className="rbody">
                    <div className="rname">{q.nome || q.name} <span style={{ fontWeight: 500, color: "var(--p-muted)", fontSize: 12.5 }}>· Orç. Nº {q.number}</span></div>
                    {q.summary && <div className="rwants">{q.summary}</div>}
                    {q.resumo && <div className="rresumo">📋 {q.resumo}</div>}
                    <div className="rmeta">
                      {q.city && <span><MapPin size={12} style={{ verticalAlign: -1 }} /> {q.city}</span>}
                      <span>montado {haAgo(q.submittedAt)}</span>
                    </div>
                  </div>
                  <div className="rval">{d > 0 ? <><span style={{ textDecoration: "line-through", fontSize: 13, color: "var(--p-muted)", fontWeight: 600, display: "block" }}>{brl(q.total, q.currency)}</span>{brl(efetivo, q.currency)}</> : brl(q.total, q.currency)}</div>
                </div>

                {q.lines.length > 0 && (
                  <div className="rlines">
                    {q.lines.map((l, i) => (
                      <div key={i} className="rline"><span>{l.label}</span><b>{brl(l.amount, q.currency)}</b></div>
                    ))}
                  </div>
                )}

                <div className="ract">
                  <a className="rpdf" href={`/api/portal/${token}/quote-reviews/${q.quoteId}/pdf${d > 0 ? `?desconto=${d}` : ""}`} target="_blank" rel="noreferrer"><FileText size={14} /> Ver PDF</a>
                  <label className="rdisc">Desconto R$
                    <input inputMode="decimal" placeholder="0" value={desc[q.quoteId] ?? ""} onChange={(e) => setDesc((s) => ({ ...s, [q.quoteId]: e.target.value }))} />
                  </label>
                  <button className="rrej" disabled={busy === q.quoteId} onClick={() => rejeitar(q)}><X size={14} /> Rejeitar</button>
                  <button className="rappr" disabled={busy === q.quoteId} onClick={() => aprovar(q)}>
                    {busy === q.quoteId ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Aprovar e enviar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
