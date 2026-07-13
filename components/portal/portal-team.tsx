"use client";

import { useEffect, useState } from "react";
import { Users, Trophy, Clock, DollarSign } from "lucide-react";

interface Row { email: string; name: string; isMe: boolean; newLeads: number; owned: number; waiting: number; qualified: number; converted: number; revenue: number; replies: number; avgFirstResponseSec: number | null }
interface Team { newLeads: number; owned: number; waiting: number; qualified: number; converted: number; revenue: number; replies: number }
interface Data { me: string | null; isAdmin: boolean; period: string; periodLabel: string; rows: Row[]; team: Team | null; unassigned: number }

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtDur = (s: number | null) => (s == null ? "—" : s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}min` : `${(s / 3600).toFixed(1)}h`);
const PERIODS: { v: string; label: string }[] = [{ v: "week", label: "Semana" }, { v: "month", label: "Mês" }];

function avatarColor(name: string) { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 42% 52%)`; }

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

  const card: React.CSSProperties = { background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 14, padding: 16 };
  const th: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--p-muted)", textTransform: "uppercase", letterSpacing: 0.4, padding: "8px 10px", textAlign: "right", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { fontSize: 13, color: "var(--p-text)", padding: "10px", textAlign: "right", whiteSpace: "nowrap", borderTop: "1px solid var(--p-border)" };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "18px 20px 60px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Users size={20} style={{ color: "var(--p-accent)" }} />
        <h1 style={{ fontSize: 18, fontWeight: 800, color: "var(--p-text)" }}>Equipe</h1>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4, background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 10, padding: 3 }}>
          {PERIODS.map((p) => (
            <button key={p.v} onClick={() => setPeriod(p.v)} style={{ padding: "5px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, background: period === p.v ? "var(--p-accent)" : "transparent", color: period === p.v ? "var(--p-on-accent)" : "var(--p-muted)" }}>{p.label}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: "var(--p-muted)", padding: 20 }}>Carregando…</p>
      ) : rows.length === 0 ? (
        <div style={{ ...card, textAlign: "center", color: "var(--p-muted)", fontSize: 13.5 }}>
          Nenhum atendente ainda. Cadastre acessos (aba Painel) e as métricas por atendente aparecem conforme cada um responde os leads.
        </div>
      ) : (
        <>
          {/* Card pessoal do usuário logado */}
          {mine && (
            <div style={{ ...card, borderColor: "color-mix(in srgb, var(--p-accent) 40%, transparent)", background: "color-mix(in srgb, var(--p-accent) 7%, var(--p-surface))" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--p-accent)", marginBottom: 10 }}>SEUS NÚMEROS · {data?.periodLabel}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
                <Kpi icon={<Trophy size={15} />} label="Convertidos" value={String(mine.converted)} />
                <Kpi icon={<DollarSign size={15} />} label="Receita" value={brl(mine.revenue)} />
                <Kpi label="Leads (dono)" value={String(mine.owned)} />
                <Kpi label="Aguardando" value={String(mine.waiting)} accent={mine.waiting > 0} />
                <Kpi icon={<Clock size={15} />} label="1ª resposta" value={fmtDur(mine.avgFirstResponseSec)} />
                <Kpi label="Respostas" value={String(mine.replies)} />
              </div>
            </div>
          )}

          {/* Ranking geral — só admin */}
          {!data?.isAdmin ? (
            <p style={{ fontSize: 12, color: "var(--p-muted)", lineHeight: 1.5 }}>Você vê apenas os seus números. O ranking da equipe fica disponível para o admin do painel.</p>
          ) : (
          <div style={{ ...card, padding: 0, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: "left" }}>Atendente</th>
                  <th style={th}>Convertidos</th>
                  <th style={th}>Receita</th>
                  <th style={th}>Leads</th>
                  <th style={th}>Aguardando</th>
                  <th style={th}>1ª resp.</th>
                  <th style={th}>Respostas</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.email} style={{ background: r.isMe ? "color-mix(in srgb, var(--p-accent) 7%, transparent)" : "transparent" }}>
                    <td style={{ ...td, textAlign: "left" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <div style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, background: avatarColor(r.name), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 }}>{r.name[0]?.toUpperCase()}</div>
                        <span style={{ fontWeight: r.isMe ? 800 : 600 }}>{r.name}{r.isMe && <span style={{ color: "var(--p-accent)", fontSize: 11, marginLeft: 6 }}>você</span>}</span>
                      </div>
                    </td>
                    <td style={{ ...td, fontWeight: 800 }}>{r.converted}</td>
                    <td style={td}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                        <span style={{ fontWeight: 700 }}>{brl(r.revenue)}</span>
                        <span style={{ width: 70, height: 4, borderRadius: 3, background: "var(--p-border)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${Math.round((r.revenue / maxRevenue) * 100)}%`, background: "var(--p-accent)" }} /></span>
                      </div>
                    </td>
                    <td style={td}>{r.owned}</td>
                    <td style={{ ...td, color: r.waiting > 0 ? "#1FA855" : "var(--p-muted)", fontWeight: r.waiting > 0 ? 700 : 400 }}>{r.waiting}</td>
                    <td style={td}>{fmtDur(r.avgFirstResponseSec)}</td>
                    <td style={td}>{r.replies}</td>
                  </tr>
                ))}
              </tbody>
              {data?.team && (
                <tfoot>
                  <tr>
                    <td style={{ ...td, textAlign: "left", fontWeight: 800, borderTop: "2px solid var(--p-border)" }}>Equipe (total)</td>
                    <td style={{ ...td, fontWeight: 800, borderTop: "2px solid var(--p-border)" }}>{data.team.converted}</td>
                    <td style={{ ...td, fontWeight: 800, borderTop: "2px solid var(--p-border)" }}>{brl(data.team.revenue)}</td>
                    <td style={{ ...td, borderTop: "2px solid var(--p-border)" }}>{data.team.owned}</td>
                    <td style={{ ...td, borderTop: "2px solid var(--p-border)" }}>{data.team.waiting}</td>
                    <td style={{ ...td, borderTop: "2px solid var(--p-border)" }}>—</td>
                    <td style={{ ...td, borderTop: "2px solid var(--p-border)" }}>{data.team.replies}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          )}

          {!!data?.unassigned && (
            <p style={{ fontSize: 12, color: "var(--p-muted)" }}>⚠️ {data.unassigned} lead(s) aguardando <b>sem dono</b> — o primeiro a responder pelo painel vira o dono.</p>
          )}
          <p style={{ fontSize: 11, color: "var(--p-muted)", lineHeight: 1.5 }}>
            O dono do lead é definido pela 1ª resposta pelo painel (e pode ser transferido na conversa). Respostas pelo app do WhatsApp não entram na contagem individual.
          </p>
        </>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, accent }: { icon?: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "var(--p-muted)", textTransform: "uppercase", letterSpacing: 0.3 }}>{icon}{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent ? "#1FA855" : "var(--p-text)", marginTop: 4, letterSpacing: "-0.02em" }}>{value}</div>
    </div>
  );
}
