"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

interface Row { email: string; name: string; isMe: boolean; newLeads: number; owned: number; waiting: number; qualified: number; converted: number; revenue: number; replies: number; avgFirstResponseSec: number | null }
interface Team { newLeads: number; owned: number; waiting: number; qualified: number; converted: number; revenue: number; replies: number }
interface Data { me: string | null; isAdmin: boolean; period: string; periodLabel: string; rows: Row[]; team: Team | null; unassigned: number }

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtDur = (s: number | null) => (s == null ? "—" : s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}min` : `${(s / 3600).toFixed(1)}h`);
const PERIODS: { v: string; label: string }[] = [{ v: "week", label: "Semana" }, { v: "month", label: "Mês" }];
function avatarColor(name: string) { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 42% 52%)`; }

function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  return <span style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, background: avatarColor(name), color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: size * 0.42 }}>{name[0]?.toUpperCase()}</span>;
}

export function PortalTeam({ token }: { token: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [period, setPeriod] = useState("month");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/portal/${token}/team-metrics?p=${period}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive) { setData(d); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [token, period]);

  const rows = data?.rows ?? [];
  const mine = rows.find((r) => r.isMe);
  const maxRevenue = Math.max(1, ...rows.map((r) => r.revenue));

  const seg: React.CSSProperties = { border: "none", background: "none", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: "var(--p-muted)", padding: "5px 12px", borderRadius: 7, cursor: "pointer" };
  const segOn: React.CSSProperties = { ...seg, background: "var(--p-accent)", color: "var(--p-on-accent)" };
  const tdBar = (v: number) => (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <b className="tnum">{brl(v)}</b>
      <span style={{ width: 78, height: 4, borderRadius: 3, background: "var(--p-raise)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${Math.round((v / maxRevenue) * 100)}%`, background: "var(--p-accent)" }} /></span>
    </span>
  );

  return (
    <div>
      {/* Topbar */}
      <div style={{ position: "sticky", top: 0, zIndex: 5, display: "flex", alignItems: "center", gap: 14, padding: "14px 26px", borderBottom: "1px solid var(--p-border)", background: "color-mix(in srgb, var(--p-bg) 82%, transparent)", backdropFilter: "saturate(180%) blur(12px)" }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", margin: 0, color: "var(--p-text)" }}>Equipe</h1>
          <div style={{ color: "var(--p-muted)", fontSize: 12.5 }}>{data?.isAdmin ? "Métricas por atendente" : "Seus números"} · {data?.periodLabel ?? "—"}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 9, padding: 3 }}>
          {PERIODS.map((p) => <button key={p.v} onClick={() => setPeriod(p.v)} style={period === p.v ? segOn : seg}>{p.label}</button>)}
        </div>
      </div>

      <div className="p-wrap">
        {loading ? (
          <p style={{ fontSize: 13, color: "var(--p-muted)", padding: 8 }}>Carregando…</p>
        ) : rows.length === 0 ? (
          <div className="p-panel" style={{ padding: 28, textAlign: "center", color: "var(--p-muted)", fontSize: 13.5 }}>
            Nenhum atendente ainda. Cadastre acessos (aba Painel) e as métricas aparecem conforme cada um responde os leads.
          </div>
        ) : (
          <>
            {/* Card pessoal */}
            {mine && (
              <div className="p-panel">
                <div className="p-phead"><h2>Seus números</h2><span className="hint">{data?.periodLabel}</span></div>
                <div className="p-metrics" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
                  <Cell k="Convertidos" v={String(mine.converted)} accent />
                  <Cell k="Receita" v={brl(mine.revenue)} />
                  <Cell k="Leads (dono)" v={String(mine.owned)} />
                  <Cell k="Aguardando" v={String(mine.waiting)} good={mine.waiting > 0} />
                  <Cell k="1ª resposta" v={fmtDur(mine.avgFirstResponseSec)} icon={<Clock size={13} />} />
                  <Cell k="Respostas" v={String(mine.replies)} />
                </div>
              </div>
            )}

            {/* Ranking (admin) */}
            {!data?.isAdmin ? (
              <p style={{ fontSize: 12, color: "var(--p-muted)", lineHeight: 1.5, padding: "0 2px" }}>Você vê apenas os seus números. O ranking da equipe fica disponível para o admin do painel.</p>
            ) : (
              <div className="p-panel">
                <div className="p-phead"><h2>Ranking de atendentes</h2><span className="hint">{data?.periodLabel}</span></div>
                <div className="p-scroll">
                  <table className="p-table" style={{ minWidth: 660 }}>
                    <thead><tr><th>Atendente</th><th>Convertidos</th><th>Receita</th><th>Leads</th><th>Aguardando</th><th>1ª resp.</th><th>Respostas</th></tr></thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.email} style={r.isMe ? { background: "color-mix(in srgb, var(--p-accent) 6%, transparent)" } : undefined}>
                          <td>
                            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <Avatar name={r.name} />
                              <b style={{ fontWeight: r.isMe ? 800 : 600 }}>{r.name}</b>
                              {r.isMe && <span style={{ color: "var(--p-accent)", fontSize: 10.5, fontWeight: 700 }}>você</span>}
                            </span>
                          </td>
                          <td className="tnum" style={{ fontWeight: 750 }}>{r.converted}</td>
                          <td>{tdBar(r.revenue)}</td>
                          <td className="tnum">{r.owned}</td>
                          <td className="tnum" style={{ color: r.waiting > 0 ? "var(--p-good)" : "var(--p-muted)", fontWeight: r.waiting > 0 ? 700 : 400 }}>{r.waiting}</td>
                          <td className="tnum">{fmtDur(r.avgFirstResponseSec)}</td>
                          <td className="tnum">{r.replies}</td>
                        </tr>
                      ))}
                      {data?.team && (
                        <tr style={{ borderTop: "2px solid var(--p-line-strong)" }}>
                          <td><b>Equipe · total</b></td>
                          <td className="tnum" style={{ fontWeight: 800 }}>{data.team.converted}</td>
                          <td className="tnum" style={{ fontWeight: 800 }}>{brl(data.team.revenue)}</td>
                          <td className="tnum">{data.team.owned}</td>
                          <td className="tnum">{data.team.waiting}</td>
                          <td>—</td>
                          <td className="tnum">{data.team.replies}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!!data?.unassigned && (
              <p style={{ fontSize: 12, color: "var(--p-muted)" }}>⚠️ {data.unassigned} lead(s) aguardando <b>sem dono</b> — o primeiro a responder pelo painel vira o dono.</p>
            )}
            <p style={{ fontSize: 11, color: "var(--p-muted)", opacity: 0.85, lineHeight: 1.5 }}>
              O dono do lead é definido pela 1ª resposta pelo painel (e pode ser transferido na conversa). Respostas pelo app do WhatsApp não entram na contagem individual.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Cell({ k, v, accent, good, icon }: { k: string; v: string; accent?: boolean; good?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="p-metric">
      <div className="k" style={{ display: "flex", alignItems: "center", gap: 5 }}>{icon}{k}</div>
      <div className="v" style={{ color: good ? "var(--p-good)" : accent ? "var(--p-accent)" : "var(--p-text)" }}>{v}</div>
    </div>
  );
}
