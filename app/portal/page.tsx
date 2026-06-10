"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PortalNav } from "@/components/portal/portal-nav";
import { LineChart } from "@/components/portal/line-chart";

interface TopAd { title: string; total: number }

interface Resumo {
  clientName: string;
  monthLabel: string;
  updatedAt: string | null;
  connected: boolean;
  leads: number;
  responded: number;
  semResposta: number;
  responseRate: number; // 0..1
  avgFirstResponseSec: number | null;
  fastestResponseSec: number | null;
  mensagensRecebidas: number;
  negociacao: number;
  convertido: number;
  origem: { anuncio: number; organico: number };
  topAds: TopAd[];
  series: { date: string; leads: number }[];
}

const num: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };
const CHART_COLOR = "#6366F1"; // hex concreto (funciona nos dois temas)

function fmtDuration(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  if (h < 24) return rem ? `${h}h ${rem}min` : `${h}h`;
  const dd = Math.floor(h / 24);
  return `${dd} dia${dd > 1 ? "s" : ""}`;
}

function buildDailySeries(series: { date: string; leads: number }[]): { date: string; value: number }[] {
  const map = new Map(series.map((s) => [s.date, s.leads]));
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  const out: { date: string; value: number }[] = [];
  for (let day = 1; day <= today; day++) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    out.push({ date: key, value: map.get(key) ?? 0 });
  }
  return out;
}

function saudacao(): string {
  const h = new Date().getHours();
  if (h < 5) return "Boa noite";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export default function PortalDashboard() {
  const router = useRouter();
  const [data, setData] = useState<Resumo | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    fetch("/api/portal/v1/auth/me")
      .then((r) => { if (!r.ok) { router.replace("/portal/login"); return; } setAuthChecked(true); })
      .catch(() => router.replace("/portal/login"));

    fetch("/api/portal/v1/resumo")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Resumo | null) => { if (d) setData(d); });
  }, [router]);

  if (!authChecked || !data) {
    return <div><PortalNav /><Skeleton /></div>;
  }

  const d = data;
  const taxa = Math.round(d.responseRate * 100);
  const series = buildDailySeries(d.series);
  const hasData = d.leads > 0;
  const pico = series.reduce((m, p) => (p.value > m.value ? p : m), series[0] ?? { date: "", value: 0 });
  const topAds = d.topAds.filter((a) => a.total > 0);
  const maxAd = topAds.length ? Math.max(...topAds.map((a) => a.total)) : 1;

  return (
    <div>
      <PortalNav />

      <main
        className="portal-rise"
        style={{
          padding: "24px clamp(20px, 4vw, 48px) 36px",
          maxWidth: 1720,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* ── Cabeçalho ── */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 23, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)", margin: 0 }}>
              {saudacao()}, {d.clientName}
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <span className="live-dot" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--green)", boxShadow: "0 0 0 3px var(--green-soft)" }} />
              <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: 0, textTransform: "capitalize" }}>
                {d.monthLabel} · atualizado em tempo real
              </p>
            </div>
          </div>
        </div>

        {/* ── Resumo (faixa fina) ── */}
        {hasData && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "13px 18px",
              borderRadius: 12,
              background: "var(--accent-soft)",
              border: "1px solid var(--border)",
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />
            <p style={{ fontSize: 14, color: "var(--text-primary)", margin: 0, lineHeight: 1.5 }}>
              Neste mês, <B>{d.leads}</B> {d.leads > 1 ? "pessoas entraram" : "pessoa entrou"} em contato e enviaram <B>{d.mensagensRecebidas}</B> mensagens.{" "}
              <B>{taxa}%</B> receberam atendimento{d.avgFirstResponseSec != null && <>, com resposta em média de <B>{fmtDuration(d.avgFirstResponseSec)}</B></>}.
            </p>
          </div>
        )}

        {/* ── KPIs principais ── */}
        <section
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            boxShadow: "var(--shadow-card)",
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
          }}
        >
          <Kpi value={String(d.leads)} label="Leads recebidos" />
          <Kpi value={String(d.mensagensRecebidas)} label="Mensagens recebidas" divider />
          <Kpi value={hasData ? `${taxa}%` : "—"} label="Taxa de atendimento" divider
            tone={hasData ? (taxa >= 80 ? "var(--green)" : taxa >= 50 ? "var(--amber)" : "var(--red)") : undefined} />
          <Kpi value={fmtDuration(d.avgFirstResponseSec)} label="Tempo médio de resposta" divider
            tone={d.avgFirstResponseSec != null && d.avgFirstResponseSec <= 1800 ? "var(--green)" : d.avgFirstResponseSec != null && d.avgFirstResponseSec > 3600 ? "var(--amber)" : undefined} />
        </section>

        {/* ── Linha de detalhe (3 painéis) ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          {/* Origem dos contatos */}
          <Panel label="Origem dos contatos">
            {hasData ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <OrigemRow color="var(--accent)" label="dos anúncios" value={d.origem.anuncio} total={d.leads} />
                <OrigemRow color="var(--green)" label="orgânico / direto" value={d.origem.organico} total={d.leads} />
              </div>
            ) : <EmptyText>A origem de cada contato aparece aqui assim que os leads chegarem.</EmptyText>}
          </Panel>

          {/* Atendimento */}
          <Panel label="Atendimento">
            {hasData ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                <StatRow label="Receberam resposta" value={String(d.responded)} tone="var(--green)" />
                <StatRow label="Ainda sem resposta" value={String(d.semResposta)} tone={d.semResposta > 0 ? "var(--amber)" : "var(--text-primary)"} />
                <StatRow label="Resposta mais rápida" value={fmtDuration(d.fastestResponseSec)} />
              </div>
            ) : <EmptyText>A velocidade e a cobertura do atendimento aparecem aqui.</EmptyText>}
          </Panel>

          {/* O que mais traz contatos */}
          <Panel label="O que mais traz contatos">
            {topAds.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {topAds.map((a) => (
                  <div key={a.title}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</span>
                      <span style={{ ...num, fontSize: 13, fontWeight: 700, color: "var(--text-primary)", flexShrink: 0 }}>{a.total}</span>
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: "var(--bg-elevated)", overflow: "hidden" }}>
                      <div style={{ width: `${(a.total / maxAd) * 100}%`, height: "100%", background: "var(--accent)", borderRadius: 3 }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : <EmptyText>Quando seus anúncios trouxerem contatos, os que mais convertem aparecem aqui.</EmptyText>}
          </Panel>
        </div>

        {/* ── Evolução (gráfico único) ── */}
        <Panel label="Leads recebidos ao longo do tempo">
          {hasData && series.length > 1 ? (
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
                <span style={{ ...num, fontSize: 20, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>{d.leads}</span>
                <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                  no mês{pico.value > 0 ? ` · pico de ${pico.value} em ${pico.date.slice(8)}/${pico.date.slice(5, 7)}` : ""}
                </span>
              </div>
              <LineChart data={series} color={CHART_COLOR} height={150} showDates />
            </div>
          ) : <EmptyText>O histórico diário é construído automaticamente conforme novos contatos chegam.</EmptyText>}
        </Panel>
      </main>
    </div>
  );
}

/* ──────────────── Componentes ──────────────── */

function Kpi({ value, label, tone, divider }: { value: string; label: string; tone?: string; divider?: boolean }) {
  return (
    <div style={{ padding: "18px 22px", borderLeft: divider ? "1px solid var(--border)" : "none" }}>
      <p style={{ ...num, fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1, color: tone ?? "var(--text-primary)" }}>{value}</p>
      <p style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)", marginTop: 9 }}>{label}</p>
    </div>
  );
}

function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column" }}>
      <h2 style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 10px" }}>
        {label}
      </h2>
      <div
        style={{
          flex: 1,
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          boxShadow: "var(--shadow-card)",
          padding: "20px 22px",
        }}
      >
        {children}
      </div>
    </section>
  );
}

function B({ children }: { children: React.ReactNode }) {
  return <strong style={{ fontWeight: 700, color: "var(--text-primary)" }}>{children}</strong>;
}

function StatRow({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
      <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ ...num, fontSize: 16, fontWeight: 700, color: tone ?? "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

function OrigemRow({ color, label, value, total }: { color: string; label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 7 }}>
        <span style={{ ...num, fontSize: 23, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>{value}</span>
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{label}</span>
        <span style={{ ...num, marginLeft: "auto", fontSize: 12.5, fontWeight: 600, color }}>{pct}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 4, background: "var(--bg-elevated)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width 500ms ease-out" }} />
      </div>
    </div>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 13.5, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>{children}</p>;
}

function Skeleton() {
  return (
    <div style={{ padding: "24px clamp(20px, 4vw, 48px)", maxWidth: 1720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ height: 52, width: 340, borderRadius: 10, background: "var(--bg-surface)", animation: "pulse 1.5s infinite" }} />
      <div style={{ height: 46, borderRadius: 12, background: "var(--bg-surface)", animation: "pulse 1.5s infinite" }} />
      <div style={{ height: 86, borderRadius: 14, background: "var(--bg-surface)", animation: "pulse 1.5s infinite" }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {[0, 1, 2].map((i) => <div key={i} style={{ height: 150, borderRadius: 14, background: "var(--bg-surface)", animation: "pulse 1.5s infinite" }} />)}
      </div>
      <div style={{ height: 210, borderRadius: 14, background: "var(--bg-surface)", animation: "pulse 1.5s infinite" }} />
    </div>
  );
}
