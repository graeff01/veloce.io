"use client";

import { useEffect, useState, useCallback } from "react";
import { GraduationCap, AlertTriangle, Check, Loader2, RotateCcw, ArrowRight } from "lucide-react";

interface Correction {
  id: string; kind: string; leadWanted: string | null; aiProposed: string | null; note: string | null;
  reviewer: string | null; resolved: boolean; resolvedBy: string | null; createdAt: string; contactId: string | null;
}

function haAgo(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

export function PortalAprendizado({ token }: { token: string }) {
  const [items, setItems] = useState<Correction[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/portal/${token}/corrections`, { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      setItems(d?.corrections ?? []); setLoaded(true);
    } catch { /* ignora */ }
  }, [token]);

  useEffect(() => { load(); const id = setInterval(load, 20000); return () => clearInterval(id); }, [load]);

  async function toggle(c: Correction) {
    setBusy(c.id);
    try {
      await fetch(`/api/portal/${token}/corrections/${c.id}/resolve`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resolved: !c.resolved }),
      });
      load();
    } catch { /* ignora */ } finally { setBusy(null); }
  }

  const pending = items.filter((c) => !c.resolved);
  const done = items.filter((c) => c.resolved);

  return (
    <div className="lwrap">
      <style>{`
        .lwrap{max-width:900px;margin:0 auto;padding:26px 22px 70px}
        .lhead{display:flex;align-items:center;gap:12px;margin-bottom:6px}
        .lhead h1{font-size:20px;margin:0;letter-spacing:-.01em}
        .lcount{background:var(--p-accent);color:var(--p-on-accent);font-size:12px;font-weight:700;border-radius:999px;padding:2px 9px;min-width:22px;text-align:center}
        .lsub{color:var(--p-muted);font-size:13px;margin:0 0 20px;line-height:1.55;max-width:640px}
        .lsectitle{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--p-muted);margin:22px 0 10px}
        .lcards{display:flex;flex-direction:column;gap:11px}
        .lcard{border:1px solid var(--p-border);background:var(--p-surface);border-radius:13px;padding:15px 17px;border-left:3px solid var(--p-crit,#e5484d)}
        .lcard.done{border-left-color:var(--p-good,#30a46c);opacity:.75}
        .ltop{display:flex;gap:12px;align-items:flex-start}
        .lic{width:34px;height:34px;border-radius:9px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--p-crit,#e5484d) 15%,transparent);color:var(--p-crit,#e5484d)}
        .lcard.done .lic{background:color-mix(in srgb,var(--p-good,#30a46c) 15%,transparent);color:var(--p-good,#30a46c)}
        .lbody{flex:1;min-width:0}
        .lnote{font-size:14px;font-weight:700;color:var(--p-text);line-height:1.3}
        .lnote.empty{font-weight:600;color:var(--p-muted)}
        .lrow{display:grid;grid-template-columns:auto 1fr;gap:8px 10px;margin-top:10px;font-size:12.5px;align-items:start}
        .lrow .k{color:var(--p-muted);font-weight:600;white-space:nowrap}
        .lrow .v{color:var(--p-text)}
        .lrow .v.ai{color:var(--p-crit,#e5484d)}
        .lmeta{font-size:11.5px;color:var(--p-muted);margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
        .lact{display:flex;align-items:center;gap:8px;flex-shrink:0}
        .lbtn{display:inline-flex;align-items:center;gap:6px;background:var(--p-good,#30a46c);color:#fff;border:none;border-radius:9px;padding:8px 13px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit}
        .lbtn:disabled{opacity:.6;cursor:default}
        .lreopen{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--p-border);background:transparent;color:var(--p-muted);border-radius:9px;padding:7px 11px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit}
        .lempty{text-align:center;color:var(--p-muted);padding:50px 20px}
        .lempty .ei{width:56px;height:56px;border-radius:15px;background:var(--p-accent-soft);color:var(--p-accent);display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px}
      `}</style>

      <div className="lhead">
        <h1>Aprendizado da IA</h1>
        {pending.length > 0 && <span className="lcount">{pending.length}</span>}
      </div>
      <p className="lsub">Toda vez que um vendedor rejeita um orçamento, o erro aparece aqui. Ajuste o cadastro (catálogo, frete) ou o comportamento, marque como <b>ensinado</b> — e a IA para de repetir. <b>Ela melhora com o uso.</b></p>

      {!loaded ? (
        <div className="lempty"><Loader2 size={22} className="animate-spin" /></div>
      ) : items.length === 0 ? (
        <div className="lempty">
          <div className="ei"><GraduationCap size={26} /></div>
          <div style={{ fontSize: 14 }}>Nenhuma correção registrada ainda.</div>
          <div style={{ fontSize: 12.5, marginTop: 4, maxWidth: 420, marginInline: "auto" }}>Quando um vendedor rejeitar um orçamento na revisão, o que a IA errou aparece aqui — pra você ajustar e ensinar. 🎓</div>
        </div>
      ) : (
        <>
          {pending.length > 0 && <div className="lsectitle">A corrigir ({pending.length})</div>}
          <div className="lcards">
            {pending.map((c) => (
              <div key={c.id} className="lcard">
                <div className="ltop">
                  <div className="lic"><AlertTriangle size={17} /></div>
                  <div className="lbody">
                    {c.note ? <div className="lnote">“{c.note}”</div> : <div className="lnote empty">Orçamento rejeitado pelo vendedor</div>}
                    <div className="lrow">
                      {c.leadWanted && <><span className="k">Lead pediu</span><span className="v">{c.leadWanted}</span></>}
                      {c.aiProposed && <><span className="k">IA propôs</span><span className="v ai">{c.aiProposed}</span></>}
                    </div>
                    <div className="lmeta">
                      {c.reviewer && <span>por <b>{c.reviewer}</b></span>}
                      <span>{haAgo(c.createdAt)}</span>
                    </div>
                  </div>
                  <div className="lact">
                    <button className="lbtn" disabled={busy === c.id} onClick={() => toggle(c)}>
                      {busy === c.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Ensinado
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {done.length > 0 && <div className="lsectitle">Já ensinado ({done.length})</div>}
          <div className="lcards">
            {done.map((c) => (
              <div key={c.id} className="lcard done">
                <div className="ltop">
                  <div className="lic"><Check size={17} /></div>
                  <div className="lbody">
                    {c.note ? <div className="lnote">“{c.note}”</div> : <div className="lnote empty">Orçamento rejeitado</div>}
                    {(c.leadWanted || c.aiProposed) && (
                      <div className="lrow">
                        {c.leadWanted && <><span className="k">Lead pediu</span><span className="v">{c.leadWanted}</span></>}
                        {c.aiProposed && <><span className="k">IA propôs</span><span className="v ai">{c.aiProposed}</span></>}
                      </div>
                    )}
                    <div className="lmeta">
                      {c.resolvedBy && <span><ArrowRight size={11} style={{ verticalAlign: -1 }} /> ensinado por <b>{c.resolvedBy}</b></span>}
                      <span>{haAgo(c.createdAt)}</span>
                    </div>
                  </div>
                  <div className="lact">
                    <button className="lreopen" disabled={busy === c.id} onClick={() => toggle(c)}><RotateCcw size={13} /> Reabrir</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
