"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Flame, FileText, MapPin, Bell, BellOff, Check, Loader2 } from "lucide-react";

interface Lead {
  contactId: string; name: string; waId: string | null; approvedAt: string;
  quoteNumber: number | null; total: number | null; currency: string; summary: string | null;
  resumo: string | null; city: string | null; ownerEmail: string | null; ownerName: string | null; mine: boolean;
}

const SLA_MIN = 8; // lead esperando mais que isto (sem dono) vira URGENTE + re-alerta
const waitMin = (iso: string) => (Date.now() - new Date(iso).getTime()) / 60000;

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
    o.type = "sine"; o.frequency.value = 880;
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    o.start(); o.stop(ctx.currentTime + 0.36);
    o.onended = () => ctx.close();
  } catch { /* silencioso */ }
}

export function PortalFechamento({ token }: { token: string }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [notif, setNotif] = useState<"default" | "granted" | "denied">("default");
  const seen = useRef<Set<string>>(new Set());
  const slaAlerted = useRef<Set<string>>(new Set());
  const first = useRef(true);

  useEffect(() => { if (typeof Notification !== "undefined") setNotif(Notification.permission as typeof notif); }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/portal/${token}/hot-leads`, { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      const list: Lead[] = d?.leads ?? [];
      // Detecta leads NOVOS sem dono → notifica (menos no 1º carregamento).
      const novos = list.filter((l) => !l.ownerEmail && !seen.current.has(l.contactId));
      list.forEach((l) => seen.current.add(l.contactId));
      if (!first.current && novos.length) {
        beep();
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          const l = novos[0];
          new Notification("🔥 Novo lead quente para fechar", {
            body: `${l.name}${l.total != null ? ` · ${brl(l.total, l.currency)}` : ""}${l.city ? ` · ${l.city}` : ""}`,
            tag: "hot-lead",
          });
        }
      }
      // SLA: lead sem dono esperando além do limite → re-alerta (1x por lead).
      const estourou = list.filter((l) => !l.ownerEmail && waitMin(l.approvedAt) >= SLA_MIN && !slaAlerted.current.has(l.contactId));
      estourou.forEach((l) => slaAlerted.current.add(l.contactId));
      if (!first.current && estourou.length) {
        beep();
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          const l = estourou[0];
          new Notification("⏰ Lead quente esperando faz tempo!", { body: `${l.name} está há mais de ${SLA_MIN} min sem atendimento. Pegue antes que esfrie.`, tag: "sla-lead" });
        }
      }
      first.current = false;
      setLeads(list); setLoaded(true);
    } catch { /* ignora */ }
  }, [token]);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, [load]);

  async function pegar(l: Lead) {
    setClaiming(l.contactId);
    try {
      const r = await fetch(`/api/portal/${token}/hot-leads/${l.contactId}/claim`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d?.ok) {
        window.location.href = `/r/${token}/conversas?c=${l.contactId}`;
        return;
      }
      alert(d?.takenBy ? `Esse lead já foi pego por ${d.takenBy}.` : (d?.error || "Não consegui pegar o lead. Atualize e tente de novo."));
      load();
    } catch {
      alert("Falha de conexão. Tente de novo.");
    } finally { setClaiming(null); }
  }

  async function askNotif() {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setNotif(p as typeof notif);
  }

  const waiting = leads.filter((l) => !l.ownerEmail);
  const mine = leads.filter((l) => l.mine);

  return (
    <div className="fwrap">
      <style>{`
        .fwrap{max-width:920px;margin:0 auto;padding:26px 22px 70px}
        .fhead{display:flex;align-items:center;gap:12px;margin-bottom:6px}
        .fhead h1{font-size:20px;margin:0;letter-spacing:-.01em}
        .fcount{background:var(--p-accent);color:var(--p-on-accent);font-size:12px;font-weight:700;border-radius:999px;padding:2px 9px;min-width:22px;text-align:center}
        .fsub{color:var(--p-muted);font-size:13px;margin:0 0 18px}
        .fnotif{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;border:1px solid var(--p-border);background:var(--p-surface);color:var(--p-muted);border-radius:9px;padding:7px 12px;cursor:pointer;margin-bottom:20px}
        .fnotif.on{color:var(--p-good);border-color:color-mix(in srgb,var(--p-good) 40%,transparent)}
        .fsectitle{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--p-muted);margin:22px 0 10px}
        .fcards{display:flex;flex-direction:column;gap:11px}
        .fcard{border:1px solid var(--p-border);background:var(--p-surface);border-radius:13px;padding:15px 17px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
        .fcard.hot{border-color:color-mix(in srgb,var(--p-accent) 45%,transparent);background:linear-gradient(90deg,var(--p-accent-soft),var(--p-surface) 55%)}
        .fcard.urg{border-color:var(--p-crit);background:linear-gradient(90deg,var(--p-crit-soft),var(--p-surface) 60%)}
        .furg{font-size:10.5px;font-weight:700;color:var(--p-crit);background:var(--p-crit-soft);border-radius:6px;padding:1px 7px;vertical-align:1px}
        .fwants{font-size:13.5px;font-weight:600;color:var(--p-text);margin-top:2px}
        .fresumo{font-size:12.5px;color:var(--p-muted);margin-top:4px;background:var(--p-bg);border:1px solid var(--p-border);border-radius:7px;padding:5px 9px;display:inline-block}
        .fic{width:40px;height:40px;border-radius:11px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:var(--p-accent-soft);color:var(--p-accent)}
        .fbody{flex:1;min-width:180px}
        .fname{font-size:15px;font-weight:700;color:var(--p-text)}
        .fmeta{font-size:12.5px;color:var(--p-muted);margin-top:2px;display:flex;gap:12px;flex-wrap:wrap;align-items:center}
        .fmeta b{color:var(--p-text);font-weight:700}
        .fval{font-size:17px;font-weight:800;color:var(--p-accent);white-space:nowrap}
        .fact{display:flex;gap:8px;align-items:center}
        .fpeg{display:inline-flex;align-items:center;gap:7px;background:var(--p-accent);color:var(--p-on-accent);border:none;border-radius:10px;padding:10px 16px;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit}
        .fpeg:disabled{opacity:.6;cursor:default}
        .fowner{font-size:12px;color:var(--p-muted);font-weight:600}
        .fopen{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--p-accent);color:var(--p-accent);background:transparent;border-radius:10px;padding:9px 14px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
        .flink{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;color:var(--p-accent);text-decoration:none;font-weight:600}
        .fempty{text-align:center;color:var(--p-muted);padding:50px 20px}
        .fempty .ei{width:56px;height:56px;border-radius:15px;background:var(--p-accent-soft);color:var(--p-accent);display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px}
      `}</style>

      <div className="fhead">
        <h1>Fila de Fechamento</h1>
        {waiting.length > 0 && <span className="fcount">{waiting.length}</span>}
      </div>
      <p className="fsub">Leads que <b>aprovaram o orçamento</b> e querem fechar. Pegue para assumir o atendimento — a IA silencia na hora.</p>

      {notif !== "granted" ? (
        <button className="fnotif" onClick={askNotif}><Bell size={14} /> Ativar aviso na tela quando chegar um lead quente</button>
      ) : (
        <div className="fnotif on"><Check size={14} /> Avisos ativados — você recebe um alerta mesmo com a aba em segundo plano</div>
      )}

      {!loaded ? (
        <div className="fempty"><Loader2 size={22} className="animate-spin" /></div>
      ) : leads.length === 0 ? (
        <div className="fempty">
          <div className="ei"><Flame size={26} /></div>
          <div style={{ fontSize: 14 }}>Nenhum lead esperando fechamento agora.</div>
          <div style={{ fontSize: 12.5, marginTop: 4 }}>Quando um cliente aprovar um orçamento, ele aparece aqui na hora. 🔔</div>
        </div>
      ) : (
        <>
          {waiting.length > 0 && <div className="fsectitle">🔥 Esperando um vendedor ({waiting.length})</div>}
          <div className="fcards">
            {waiting.map((l) => {
              const urgent = waitMin(l.approvedAt) >= SLA_MIN;
              return (
              <div key={l.contactId} className={`fcard hot${urgent ? " urg" : ""}`}>
                <div className="fic"><Flame size={20} /></div>
                <div className="fbody">
                  <div className="fname">{l.name} {urgent && <span className="furg">⏰ urgente</span>}</div>
                  {l.summary && <div className="fwants">{l.summary}</div>}
                  {l.resumo && <div className="fresumo">📋 {l.resumo}</div>}
                  <div className="fmeta">
                    {l.city && <span><MapPin size={12} style={{ verticalAlign: -1 }} /> {l.city}</span>}
                    {l.quoteNumber && <span>Orç. Nº {l.quoteNumber}</span>}
                    <span>aprovado {haAgo(l.approvedAt)}</span>
                  </div>
                </div>
                <div className="fval">{brl(l.total, l.currency)}</div>
                <div className="fact">
                  <button className="fpeg" disabled={claiming === l.contactId} onClick={() => pegar(l)}>
                    {claiming === l.contactId ? <Loader2 size={15} className="animate-spin" /> : <Flame size={15} />} Pegar
                  </button>
                </div>
              </div>
            ); })}
          </div>

          {mine.length > 0 && <div className="fsectitle">Meus atendimentos ({mine.length})</div>}
          <div className="fcards">
            {mine.map((l) => (
              <div key={l.contactId} className="fcard">
                <div className="fic"><FileText size={18} /></div>
                <div className="fbody">
                  <div className="fname">{l.name}</div>
                  {l.summary && <div className="fwants">{l.summary}</div>}
                  {l.resumo && <div className="fresumo">📋 {l.resumo}</div>}
                  <div className="fmeta">
                    {l.city && <span>{l.city}</span>}
                    <span>aprovado {haAgo(l.approvedAt)}</span>
                  </div>
                </div>
                <div className="fval">{brl(l.total, l.currency)}</div>
                <a className="fopen" href={`/r/${token}/conversas?c=${l.contactId}`}><FileText size={14} /> Abrir</a>
              </div>
            ))}
          </div>

          {/* leads já pegos por OUTRO vendedor (visibilidade / evita confusão) */}
          {leads.filter((l) => l.ownerEmail && !l.mine).length > 0 && (
            <>
              <div className="fsectitle">Em atendimento por outros</div>
              <div className="fcards">
                {leads.filter((l) => l.ownerEmail && !l.mine).map((l) => (
                  <div key={l.contactId} className="fcard" style={{ opacity: .7 }}>
                    <div className="fic"><Check size={18} /></div>
                    <div className="fbody">
                      <div className="fname">{l.name}</div>
                      <div className="fmeta"><span>com <b>{l.ownerName}</b></span>{l.city && <span>{l.city}</span>}</div>
                    </div>
                    <div className="fval">{brl(l.total, l.currency)}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
