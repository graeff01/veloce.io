"use client";

import { useEffect, useState, useCallback } from "react";
import { Gauge, TrendingUp, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

interface Usage {
  count: number; limit: number | null; rate: number | null;
  excess: number; excessCost: number; projection: number;
  daysInMonth: number; dayOfMonth: number;
  daily: { day: number; count: number }[]; month: string;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const nf = (v: number) => v.toLocaleString("pt-BR");
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function PortalConsumo({ token }: { token: string }) {
  const [u, setU] = useState<Usage | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/portal/${token}/usage`, { cache: "no-store" });
      if (r.ok) setU(await r.json());
    } catch { /* ignora */ } finally { setLoaded(true); }
  }, [token]);

  useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id); }, [load]);

  if (!loaded) return <div style={{ maxWidth: 900, margin: "0 auto", padding: 60, textAlign: "center" }}><Loader2 size={22} className="animate-spin" /></div>;
  if (!u) return <div style={{ maxWidth: 900, margin: "0 auto", padding: 40, color: "var(--p-muted)" }}>Não foi possível carregar o consumo.</div>;

  const limit = u.limit;
  const pct = limit ? Math.min(100, Math.round((u.count / limit) * 100)) : 0;
  const over = limit != null && u.count > limit;
  const near = limit != null && !over && u.count >= limit * 0.85;
  const projOver = limit != null && u.projection > limit;
  const barColor = over ? "var(--p-crit,#e5484d)" : near ? "#e0a800" : "var(--p-accent)";
  const maxDaily = Math.max(1, ...u.daily.map((d) => d.count));
  const monthName = MONTHS[new Date(u.month).getUTCMonth()];

  return (
    <div className="cwrap">
      <style>{`
        .cwrap{max-width:900px;margin:0 auto;padding:26px 22px 70px}
        .chead{display:flex;align-items:center;gap:12px;margin-bottom:4px}
        .chead h1{font-size:20px;margin:0;letter-spacing:-.01em;text-transform:capitalize}
        .csub{color:var(--p-muted);font-size:13px;margin:0 0 20px}
        .ccard{border:1px solid var(--p-border);background:var(--p-surface);border-radius:14px;padding:20px 22px}
        .cbig{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
        .cnum{font-size:40px;font-weight:800;color:var(--p-text);line-height:1;font-variant-numeric:tabular-nums}
        .cof{font-size:15px;color:var(--p-muted);font-weight:600}
        .cbar{height:12px;border-radius:999px;background:var(--p-bg);border:1px solid var(--p-border);overflow:hidden;margin:16px 0 8px}
        .cbar > div{height:100%;border-radius:999px;transition:width .5s ease}
        .cbarlabels{display:flex;justify-content:space-between;font-size:11.5px;color:var(--p-muted);font-weight:600}
        .cstatus{display:flex;align-items:center;gap:9px;font-size:13.5px;font-weight:600;margin-top:16px;padding:11px 14px;border-radius:10px}
        .cstatus.ok{background:color-mix(in srgb,var(--p-good,#30a46c) 12%,transparent);color:var(--p-good,#30a46c)}
        .cstatus.warn{background:color-mix(in srgb,#e0a800 16%,transparent);color:#b58900}
        .cstatus.crit{background:var(--p-crit-soft,#feebec);color:var(--p-crit,#e5484d)}
        .cgrid{display:grid;grid-template-columns:1fr 1fr;gap:13px;margin-top:14px}
        @media(max-width:560px){.cgrid{grid-template-columns:1fr}}
        .cmini{border:1px solid var(--p-border);background:var(--p-surface);border-radius:12px;padding:15px 17px}
        .cmini .k{font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--p-muted);font-weight:700;display:flex;align-items:center;gap:6px}
        .cmini .v{font-size:24px;font-weight:800;color:var(--p-text);margin-top:6px;font-variant-numeric:tabular-nums}
        .cmini .h{font-size:12px;color:var(--p-muted);margin-top:3px}
        .cchart{border:1px solid var(--p-border);background:var(--p-surface);border-radius:12px;padding:16px 17px;margin-top:14px}
        .cchart .t{font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--p-muted);font-weight:700;margin-bottom:12px}
        .cbars{display:flex;align-items:flex-end;gap:3px;height:90px}
        .cbars > div{flex:1;background:var(--p-accent-soft);border-radius:3px 3px 0 0;min-height:2px;position:relative}
        .cbars > div > span{position:absolute;bottom:100%;left:50%;transform:translateX(-50%);font-size:9px;color:var(--p-muted);opacity:0;white-space:nowrap;margin-bottom:2px}
        .cbars > div:hover > span{opacity:1}
        .cnote{font-size:12.5px;color:var(--p-muted);border-left:2px solid var(--p-border);padding-left:14px;margin-top:18px;line-height:1.55}
      `}</style>

      <div className="chead"><Gauge size={19} style={{ color: "var(--p-accent)" }} /><h1>Consumo — {monthName}</h1></div>
      <p className="csub">Acompanhe os atendimentos do mês e o seu plano em tempo real.</p>

      <div className="ccard">
        <div className="cbig">
          <span className="cnum">{nf(u.count)}</span>
          {limit != null && <span className="cof">de {nf(limit)} atendimentos inclusos</span>}
        </div>
        {limit != null && (
          <>
            <div className="cbar"><div style={{ width: `${pct}%`, background: barColor }} /></div>
            <div className="cbarlabels"><span>{pct}% do plano</span><span>{over ? `${nf(u.excess)} acima` : `${nf(Math.max(0, limit - u.count))} restantes`}</span></div>
          </>
        )}

        {limit != null && (
          over ? (
            <div className="cstatus crit"><AlertTriangle size={16} /> Você ultrapassou os {nf(limit)} inclusos. O excedente é cobrado só pelo custo.</div>
          ) : near ? (
            <div className="cstatus warn"><AlertTriangle size={16} /> Você está perto do limite do plano ({pct}%). Fique de olho.</div>
          ) : (
            <div className="cstatus ok"><CheckCircle2 size={16} /> Tudo dentro do plano.</div>
          )
        )}
      </div>

      {limit != null && (
        <div className="cgrid">
          <div className="cmini">
            <div className="k"><TrendingUp size={13} /> Projeção do mês</div>
            <div className="v">{nf(u.projection)}</div>
            <div className="h">{projOver ? `no ritmo atual, ~${nf(u.projection - limit)} de excedente` : `no ritmo atual, dentro dos ${nf(limit)}`}</div>
          </div>
          <div className="cmini">
            <div className="k"><AlertTriangle size={13} /> Excedente até agora</div>
            <div className="v">{u.rate != null ? brl(u.excessCost) : nf(u.excess)}</div>
            <div className="h">{u.excess > 0 ? `${nf(u.excess)} atendimentos${u.rate != null ? ` × ${brl(u.rate)} (só o custo)` : ""}` : "nenhum excedente este mês"}</div>
          </div>
        </div>
      )}

      {u.daily.length > 0 && (
        <div className="cchart">
          <div className="t">Atendimentos por dia</div>
          <div className="cbars">
            {Array.from({ length: u.daysInMonth }, (_, i) => {
              const d = u.daily.find((x) => x.day === i + 1);
              const n = d?.count ?? 0;
              return <div key={i} style={{ height: `${(n / maxDaily) * 100}%`, background: i + 1 === u.dayOfMonth ? "var(--p-accent)" : undefined }}><span>dia {i + 1}: {n}</span></div>;
            })}
          </div>
        </div>
      )}

      <div className="cnote">
        Cada <b>atendimento</b> é uma pessoa distinta que conversou com a IA no mês.
        {limit != null && <> Até <b>{nf(limit)}</b> está incluído na mensalidade. Acima disso, você paga <b>apenas o custo</b>{u.rate != null && <> ({brl(u.rate)} por atendimento)</>} — sem margem da Veloce.</>}
      </div>
    </div>
  );
}
