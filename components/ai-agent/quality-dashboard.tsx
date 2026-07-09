"use client";

import { useEffect, useState } from "react";
import { Loader2, Activity, ShieldAlert, HandHelping, AlertTriangle, Timer, DollarSign, Gauge, X } from "lucide-react";

// ── Painel de qualidade da IA (F0) ───────────────────────────────────────────
// Observabilidade sobre o log AiInteraction: volume, escalonamento, abstenção,
// bloqueio, erro, latência e custo — por cliente e no total. É o "painel do motor":
// dá pra ver a saúde da IA sem abrir o banco.

interface ClientRow {
  clientId: string; clientName: string; status: string; enabled: boolean;
  vertical: string; model: string; total: number;
  escalou: number; abster: number; bloqueado: number; erro: number;
  taxaEscalonamento: number; taxaAbstencao: number; taxaBloqueio: number; taxaErro: number;
  avgLatencyMs: number; custoUsd: number; lastAt: string | null;
}
interface QualityAlert { severity: "high" | "warn"; clientName: string; message: string }
interface Data {
  days: number;
  totals: { total: number; escalou: number; abster: number; bloqueado: number; erro: number; custoUsd: number; qualidadeMedia: number | null };
  alerts: QualityAlert[];
  clients: ClientRow[];
}
interface Interaction {
  id: string; inbound: string | null; outbound: string | null;
  decision: string | null; status: string; createdAt: string; latencyMs: number; inboundMediaType: string | null;
}

function fmtDur(ms: number) {
  if (!ms) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function statusPill(status: string, enabled: boolean) {
  const live = status === "live" && enabled;
  const bg = live ? "rgba(22,163,74,0.10)" : status === "test" ? "rgba(245,158,11,0.10)" : "rgba(107,114,128,0.10)";
  const fg = live ? "#16A34A" : status === "test" ? "#B45309" : "#6B7280";
  const label = live ? "no ar" : status === "test" ? "teste" : "rascunho";
  return <span style={{ fontSize: 11, fontWeight: 700, color: fg, background: bg, padding: "2px 8px", borderRadius: 20 }}>{label}</span>;
}

function MetricCard({ icon, label, value, sub, accent, attention }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; accent: string; attention?: boolean;
}) {
  return (
    <div style={{
      background: "var(--card, #fff)", border: `1px solid ${attention ? "rgba(220,38,38,0.35)" : "rgba(0,0,0,0.08)"}`,
      borderRadius: 14, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8, minWidth: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: accent }}>
        {icon}
        <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", color: "#6B7280" }}>{label}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 760, lineHeight: 1, color: "#111827" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#6B7280" }}>{sub}</div>}
    </div>
  );
}

export function QualityDashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [drill, setDrill] = useState<{ clientName: string; rows: Interaction[]; loading: boolean } | null>(null);

  async function openDrill(clientId: string, clientName: string) {
    setDrill({ clientName, rows: [], loading: true });
    try {
      const r = await fetch(`/api/ai-agent/interactions?clientId=${clientId}&flagged=1&limit=30`);
      const d: { interactions: Interaction[] } = await r.json();
      setDrill({ clientName, rows: d.interactions ?? [], loading: false });
    } catch {
      setDrill({ clientName, rows: [], loading: false });
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const r = await fetch(`/api/ai-agent/quality?days=${days}`);
        const d: Data = await r.json();
        if (active) setData(d);
      } catch {
        if (active) setData(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [days]);

  if (loading) {
    return <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Loader2 className="animate-spin" size={26} color="#6B7280" /></div>;
  }
  if (!data) return <div style={{ padding: 24, color: "#6B7280" }}>Não foi possível carregar as métricas.</div>;

  const t = data.totals;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "8px 4px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 760, margin: 0, color: "#111827" }}>Qualidade da IA</h1>
          <p style={{ fontSize: 13, color: "#6B7280", margin: "4px 0 0" }}>Saúde do motor nos últimos {data.days} dias · {data.clients.length} agente(s) configurado(s)</p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => { setLoading(true); setDays(d); }} style={{
              fontSize: 12.5, fontWeight: 700, padding: "6px 12px", borderRadius: 8, cursor: "pointer",
              border: "1px solid rgba(0,0,0,0.1)", background: days === d ? "#111827" : "transparent", color: days === d ? "#fff" : "#374151",
            }}>{d}d</button>
          ))}
        </div>
      </div>

      {data.alerts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {data.alerts.map((a, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "8px 12px", borderRadius: 10,
              background: a.severity === "high" ? "rgba(220,38,38,0.08)" : "rgba(245,158,11,0.10)",
              border: `1px solid ${a.severity === "high" ? "rgba(220,38,38,0.25)" : "rgba(245,158,11,0.25)"}`,
              color: a.severity === "high" ? "#B91C1C" : "#B45309",
            }}>
              <AlertTriangle size={14} /> <b>{a.clientName}</b> — {a.message}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <MetricCard icon={<Activity size={15} />} accent="#2563EB" label="Turnos" value={t.total.toLocaleString("pt-BR")} sub="mensagens respondidas pela IA" />
        <MetricCard icon={<HandHelping size={15} />} accent="#0EA5E9" label="Escalou" value={t.escalou.toLocaleString("pt-BR")} sub={`${t.total ? Math.round((t.escalou / t.total) * 100) : 0}% dos turnos`} />
        <MetricCard icon={<ShieldAlert size={15} />} accent="#B45309" label="Absteve" value={t.abster.toLocaleString("pt-BR")} sub="preferiu não arriscar (sem fonte)" />
        <MetricCard icon={<ShieldAlert size={15} />} accent="#DC2626" label="Bloqueado" value={t.bloqueado.toLocaleString("pt-BR")} sub="guardrail de saída barrou" attention={t.bloqueado > 0} />
        <MetricCard icon={<AlertTriangle size={15} />} accent="#DC2626" label="Erros" value={t.erro.toLocaleString("pt-BR")} sub="falhas técnicas" attention={t.erro > 0} />
        <MetricCard icon={<DollarSign size={15} />} accent="#16A34A" label="Custo est." value={`$${t.custoUsd.toFixed(2)}`} sub="estimativa por tokens" />
        <MetricCard icon={<Gauge size={15} />} accent="#7C3AED" label="Qualidade" value={t.qualidadeMedia != null ? `${Math.round(t.qualidadeMedia * 100)}%` : "—"} sub="nota do juiz (amostra)" />
      </div>

      <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "rgba(0,0,0,0.02)", textAlign: "left", color: "#6B7280" }}>
                {["Cliente", "Status", "Vertical", "Turnos", "Escalou", "Absteve", "Bloq.", "Erro", "Latência", "Custo", "Último"].map((h) => (
                  <th key={h} style={{ padding: "10px 12px", fontWeight: 700, whiteSpace: "nowrap", fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.3 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.clients.map((c) => (
                <tr key={c.clientId} onClick={() => openDrill(c.clientId, c.clientName)} title="Ver interações que merecem inspeção" style={{ borderTop: "1px solid rgba(0,0,0,0.05)", cursor: "pointer" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111827", whiteSpace: "nowrap" }}>{c.clientName}</td>
                  <td style={{ padding: "10px 12px" }}>{statusPill(c.status, c.enabled)}</td>
                  <td style={{ padding: "10px 12px", color: "#6B7280" }}>{c.vertical}</td>
                  <td style={{ padding: "10px 12px", fontVariantNumeric: "tabular-nums" }}>{c.total.toLocaleString("pt-BR")}</td>
                  <td style={{ padding: "10px 12px", fontVariantNumeric: "tabular-nums" }}>{c.escalou} <span style={{ color: "#9CA3AF", fontSize: 11 }}>({c.taxaEscalonamento}%)</span></td>
                  <td style={{ padding: "10px 12px", fontVariantNumeric: "tabular-nums" }}>{c.abster} <span style={{ color: "#9CA3AF", fontSize: 11 }}>({c.taxaAbstencao}%)</span></td>
                  <td style={{ padding: "10px 12px", fontVariantNumeric: "tabular-nums", color: c.bloqueado ? "#DC2626" : "inherit" }}>{c.bloqueado}</td>
                  <td style={{ padding: "10px 12px", fontVariantNumeric: "tabular-nums", color: c.erro ? "#DC2626" : "inherit" }}>{c.erro}</td>
                  <td style={{ padding: "10px 12px", fontVariantNumeric: "tabular-nums", color: "#6B7280" }}><Timer size={11} style={{ verticalAlign: "-1px" }} /> {fmtDur(c.avgLatencyMs)}</td>
                  <td style={{ padding: "10px 12px", fontVariantNumeric: "tabular-nums", color: "#6B7280" }}>${c.custoUsd.toFixed(2)}</td>
                  <td style={{ padding: "10px 12px", color: "#6B7280", whiteSpace: "nowrap" }}>{fmtDate(c.lastAt)}</td>
                </tr>
              ))}
              {data.clients.length === 0 && (
                <tr><td colSpan={11} style={{ padding: 24, textAlign: "center", color: "#6B7280" }}>Nenhum agente configurado ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {drill && (
        <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "#111827" }}>Interações para inspeção — {drill.clientName}</h2>
              <p style={{ fontSize: 12, color: "#6B7280", margin: "2px 0 0" }}>Bloqueadas, com erro ou abstidas (as que valem revisar)</p>
            </div>
            <button onClick={() => setDrill(null)} title="Fechar" style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280", padding: 4 }}><X size={16} /></button>
          </div>
          {drill.loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 24 }}><Loader2 className="animate-spin" size={20} color="#6B7280" /></div>
          ) : drill.rows.length === 0 ? (
            <p style={{ fontSize: 13, color: "#6B7280", padding: 8 }}>Nenhuma interação sinalizada. 👌</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {drill.rows.map((it) => (
                <div key={it.id} style={{ border: "1px solid rgba(0,0,0,0.06)", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, color: it.status === "error" || it.status === "blocked" ? "#DC2626" : "#B45309", background: it.status === "error" || it.status === "blocked" ? "rgba(220,38,38,0.08)" : "rgba(245,158,11,0.10)", padding: "2px 7px", borderRadius: 6 }}>{it.decision ?? it.status}</span>
                    <span style={{ fontSize: 11, color: "#9CA3AF" }}>{fmtDate(it.createdAt)} · {it.latencyMs}ms{it.inboundMediaType ? ` · ${it.inboundMediaType}` : ""}</span>
                  </div>
                  {it.inbound && <p style={{ fontSize: 12.5, margin: "0 0 4px", color: "#374151" }}><b style={{ color: "#6B7280" }}>Lead:</b> {it.inbound}</p>}
                  {it.outbound && <p style={{ fontSize: 12.5, margin: 0, color: "#374151" }}><b style={{ color: "#6B7280" }}>IA:</b> {it.outbound}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
