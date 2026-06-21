"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

interface Overview {
  leads: number;
  responded: number;
  converted: number;
  avgFirstResponseSec: number | null;
  funnel: { recebido: number; respondido: number; qualificado: number; negociacao: number; perdido: number; convertido: number };
}

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, boxShadow: "var(--shadow-card)" };

function fmtDur(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}min`;
}

function Kpi({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 10.5, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: tone ?? "var(--text-primary)", marginTop: 6, letterSpacing: "-0.02em" }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

function FunnelBar({ label, count, base, prevCount, color }: { label: string; count: number; base: number; prevCount: number | null; color: string }) {
  const wOfBase = base > 0 ? Math.max(3, Math.round((count / base) * 100)) : 0;
  const ofBase = base > 0 ? Math.round((count / base) * 100) : 0;
  const advance = prevCount != null && prevCount > 0 ? Math.round((count / prevCount) * 100) : null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{label}</span>
        <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
          {count.toLocaleString("pt-BR")}
          {base > 0 ? ` · ${ofBase}% do total` : ""}
          {advance != null ? ` · ${advance}% da etapa anterior` : ""}
        </span>
      </div>
      <div style={{ height: 26, borderRadius: 7, background: "var(--bg-elevated)", overflow: "hidden" }}>
        <div style={{ width: `${wOfBase}%`, height: "100%", background: color, borderRadius: 7, display: "flex", alignItems: "center", paddingLeft: 10, transition: "width 450ms ease-out" }}>
          {wOfBase > 16 ? <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>{count.toLocaleString("pt-BR")}</span> : null}
        </div>
      </div>
    </div>
  );
}

export function FunnelTab({ clientId }: { clientId: string }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<Overview | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "noconn">("loading");

  const load = useCallback(async () => {
    setState("loading");
    const res = await fetch(`/api/clients/${clientId}/whatsapp/overview?year=${year}&month=${month}`);
    if (res.status === 404) { setState("noconn"); return; }
    if (res.ok) {
      const d = await res.json();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(d); setState("ok");
    }
  }, [clientId, month, year]);

  useEffect(() => { load(); }, [load]);

  function prevMonth() { if (month === 1) { setMonth(12); setYear((y) => y - 1); } else setMonth((m) => m - 1); }
  function nextMonth() { if (month === 12) { setMonth(1); setYear((y) => y + 1); } else setMonth((m) => m + 1); }

  const navBtn: React.CSSProperties = { width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-secondary)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" };

  return (
    <div style={{ flex: 1, padding: "24px 28px 48px", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header / período */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={prevMonth} style={navBtn}><ChevronLeft size={15} /></button>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", minWidth: 130 }}>{MONTHS[month - 1]} {year}</span>
        <button onClick={nextMonth} style={navBtn}><ChevronRight size={15} /></button>
      </div>

      {state === "loading" && <div style={{ padding: 60, textAlign: "center" }}><Loader2 size={22} className="animate-spin" style={{ color: "var(--text-muted)" }} /></div>}

      {state === "noconn" && (
        <div style={{ ...card, textAlign: "center", padding: "40px 18px" }}>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>WhatsApp não conectado. O funil é alimentado pelas conversas do WhatsApp.</p>
        </div>
      )}

      {state === "ok" && data && (() => {
        const f = data.funnel;
        // Funil cumulativo (etapas "alcançou"): estritamente decrescente.
        const recebidos = f.recebido;
        const qualificados = f.qualificado + f.negociacao + f.convertido;
        const emNegociacao = f.negociacao + f.convertido;
        const convertidos = f.convertido;
        const respRate = recebidos > 0 ? Math.round((data.responded / recebidos) * 100) : 0;
        const convRate = recebidos > 0 ? Math.round((convertidos / recebidos) * 100) : 0;
        return (
          <>
            {/* KPIs principais */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              <Kpi label="Leads" value={recebidos.toLocaleString("pt-BR")} hint="recebidos no mês" />
              <Kpi label="Taxa de resposta" value={`${respRate}%`} tone={respRate >= 80 ? "var(--green)" : respRate >= 50 ? "var(--amber)" : "var(--red)"} hint="leads atendidos" />
              <Kpi label="Em negociação" value={emNegociacao.toLocaleString("pt-BR")} hint="chegaram a negociar" />
              <Kpi label="Convertidos" value={convertidos.toLocaleString("pt-BR")} tone={convertidos > 0 ? "var(--green)" : undefined} />
              <Kpi label="Taxa de conversão" value={`${convRate}%`} tone={convRate > 0 ? "var(--green)" : undefined} hint="lead → venda" />
              <Kpi label="Tempo de resposta" value={fmtDur(data.avgFirstResponseSec)} hint="média até o 1º contato" />
            </div>

            {/* Funil visual */}
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14 }}>Funil de conversão</div>
              {recebidos === 0 ? (
                <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Nenhum lead no período.</p>
              ) : (
                <>
                  <FunnelBar label="Recebidos" count={recebidos} base={recebidos} prevCount={null} color="#475569" />
                  <FunnelBar label="Qualificados" count={qualificados} base={recebidos} prevCount={recebidos} color="#2563EB" />
                  <FunnelBar label="Em negociação" count={emNegociacao} base={recebidos} prevCount={qualificados} color="#7C3AED" />
                  <FunnelBar label="Convertidos" count={convertidos} base={recebidos} prevCount={emNegociacao} color="#16A34A" />
                  {f.perdido > 0 && (
                    <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 6 }}>
                      {f.perdido.toLocaleString("pt-BR")} {f.perdido === 1 ? "lead perdido" : "leads perdidos"} no período (desinteresse ou inatividade).
                    </p>
                  )}
                </>
              )}
            </div>

            <p style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
              As etapas são preenchidas automaticamente pela conversa (sem custo de IA). O operador pode ajustar a etapa de qualquer lead na aba WhatsApp — ao fazer isso, o automático passa a respeitar essa definição.
            </p>
          </>
        );
      })()}
    </div>
  );
}
