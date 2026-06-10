"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PortalNav } from "@/components/portal/portal-nav";
import { LineChart } from "@/components/portal/line-chart";

interface Resumo {
  clientName: string;
  monthLabel: string;
  updatedAt: string | null;
  connected: boolean;
  leads: number;
  responded: number;
  responseRate: number; // 0..1
  avgFirstResponseSec: number | null;
  negociacao: number;
  convertido: number;
  origem: { anuncio: number; organico: number };
  series: { date: string; leads: number }[];
}

const num: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

/* Duração curta e humana: "8 min", "1h 12min", "2 dias". */
function fmtDuration(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  if (h < 24) return rem ? `${h}h ${rem}min` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d} dia${d > 1 ? "s" : ""}`;
}

/* Constrói a série diária completa do mês corrente (dia 1 → hoje),
   preenchendo com zero os dias sem lead — o gráfico precisa do eixo cheio. */
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
      .then((r) => {
        if (!r.ok) { router.replace("/portal/login"); return; }
        setAuthChecked(true);
      })
      .catch(() => router.replace("/portal/login"));

    fetch("/api/portal/v1/resumo")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Resumo | null) => { if (d) setData(d); });
  }, [router]);

  if (!authChecked || !data) {
    return (
      <div>
        <PortalNav />
        <Skeleton />
      </div>
    );
  }

  const d = data;
  const taxa = Math.round(d.responseRate * 100);
  const series = buildDailySeries(d.series);
  const hasData = d.leads > 0;
  const pico = series.reduce((m, p) => (p.value > m.value ? p : m), series[0] ?? { date: "", value: 0 });

  return (
    <div>
      <PortalNav />

      <main
        className="portal-rise"
        style={{
          padding: "32px clamp(24px, 5vw, 56px) 64px",
          maxWidth: 1680,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        {/* ── Cabeçalho ── */}
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)", margin: 0 }}>
            {saudacao()}, {d.clientName}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--green)", boxShadow: "0 0 0 3px var(--green-soft)" }} />
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0, textTransform: "capitalize" }}>
              {d.monthLabel} · atualizado em tempo real
            </p>
          </div>
        </div>

        {/* ── Bloco 1 · KPIs principais ── */}
        <section
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            boxShadow: "var(--shadow-card)",
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
          }}
        >
          <Kpi value={String(d.leads)} label="Leads recebidos" />
          <Kpi value={fmtDuration(d.avgFirstResponseSec)} label="Tempo médio de resposta" divider
            tone={d.avgFirstResponseSec != null && d.avgFirstResponseSec <= 1800 ? "var(--green)" : d.avgFirstResponseSec != null && d.avgFirstResponseSec > 3600 ? "var(--amber)" : undefined} />
          <Kpi value={hasData ? `${taxa}%` : "—"} label="Taxa de atendimento" divider
            tone={hasData ? (taxa >= 80 ? "var(--green)" : taxa >= 50 ? "var(--amber)" : "var(--red)") : undefined} />
          <Kpi value={String(d.negociacao)} label="Leads em negociação" divider tone={d.negociacao > 0 ? "var(--accent)" : undefined} />
        </section>

        {/* ── Bloco 2 + 3 lado a lado ── */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 1fr)", gap: 24, alignItems: "stretch" }}>
          {/* Resumo da operação */}
          <Panel label="Resumo da operação">
            {hasData ? (
              <p style={{ fontSize: 16, lineHeight: 1.7, color: "var(--text-primary)", margin: 0, maxWidth: 560 }}>
                Neste mês,{" "}
                <Strong>{d.leads} pessoa{d.leads > 1 ? "s" : ""}</Strong>{" "}
                entrar{d.leads > 1 ? "am" : "ou"} em contato com a sua loja.{" "}
                <Strong>{taxa}%</Strong> receberam atendimento
                {d.avgFirstResponseSec != null && (
                  <>, com tempo médio de resposta de <Strong>{fmtDuration(d.avgFirstResponseSec)}</Strong></>
                )}.{" "}
                {d.negociacao > 0 ? (
                  <>Hoje, <Strong>{d.negociacao}</Strong> {d.negociacao > 1 ? "estão" : "está"} em negociação
                  {d.convertido > 0 && <> e <Strong>{d.convertido}</Strong> já {d.convertido > 1 ? "fecharam" : "fechou"}</>}.</>
                ) : d.convertido > 0 ? (
                  <><Strong>{d.convertido}</Strong> {d.convertido > 1 ? "negócios já foram fechados" : "negócio já foi fechado"}.</>
                ) : (
                  <>As oportunidades em negociação aparecem aqui conforme avançam.</>
                )}
              </p>
            ) : (
              <EmptyText>
                Seu WhatsApp já está conectado. Assim que as primeiras pessoas entrarem em contato,
                o resumo da sua operação aparece aqui automaticamente.
              </EmptyText>
            )}
          </Panel>

          {/* Origem dos contatos */}
          <Panel label="Origem dos contatos">
            {hasData ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0, lineHeight: 1.6 }}>
                  Dos <Strong>{d.leads}</Strong> contatos:
                </p>
                <OrigemRow
                  color="var(--accent)"
                  label="vieram dos anúncios"
                  value={d.origem.anuncio}
                  total={d.leads}
                />
                <OrigemRow
                  color="var(--green)"
                  label="vieram organicamente"
                  value={d.origem.organico}
                  total={d.leads}
                />
              </div>
            ) : (
              <EmptyText>A origem de cada contato — anúncio ou orgânico — aparece aqui assim que os leads chegarem.</EmptyText>
            )}
          </Panel>
        </div>

        {/* ── Bloco 4 · Evolução (gráfico único) ── */}
        <Panel label="Leads recebidos ao longo do tempo">
          {hasData && series.length > 1 ? (
            <div style={{ marginTop: 4 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 18 }}>
                <span style={{ ...num, fontSize: 22, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>{d.leads}</span>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  no mês{pico.value > 0 ? ` · pico de ${pico.value} em ${pico.date.slice(8)}/${pico.date.slice(5, 7)}` : ""}
                </span>
              </div>
              <LineChart
                data={series}
                color="var(--accent)"
                height={200}
                showDates
              />
            </div>
          ) : (
            <EmptyText>O histórico diário é construído automaticamente conforme novos contatos chegam.</EmptyText>
          )}
        </Panel>

        <p style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
          Veloce · Portal do Cliente — dados sincronizados com a sua operação
        </p>
      </main>
    </div>
  );
}

/* ──────────────── Componentes ──────────────── */

function Kpi({ value, label, tone, divider }: { value: string; label: string; tone?: string; divider?: boolean }) {
  return (
    <div style={{ padding: "22px 26px", borderLeft: divider ? "1px solid var(--border)" : "none" }}>
      <p style={{ ...num, fontSize: 32, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1, color: tone ?? "var(--text-primary)" }}>{value}</p>
      <p style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text-muted)", marginTop: 10 }}>{label}</p>
    </div>
  );
}

function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column" }}>
      <h2 style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 12px" }}>
        {label}
      </h2>
      <div
        style={{
          flex: 1,
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          boxShadow: "var(--shadow-card)",
          padding: "26px 28px",
        }}
      >
        {children}
      </div>
    </section>
  );
}

function Strong({ children }: { children: React.ReactNode }) {
  return <strong style={{ fontWeight: 700, color: "var(--text-primary)" }}>{children}</strong>;
}

function OrigemRow({ color, label, value, total }: { color: string; label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <span style={{ ...num, fontSize: 26, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>{value}</span>
        <span style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>{label}</span>
      </div>
      <div style={{ height: 6, borderRadius: 4, background: "var(--bg-elevated)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width 500ms ease-out" }} />
      </div>
    </div>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0, lineHeight: 1.65, maxWidth: 460 }}>{children}</p>;
}

function Skeleton() {
  return (
    <div style={{ padding: "32px clamp(24px, 5vw, 56px)", maxWidth: 1680, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ height: 60, width: 360, borderRadius: 10, background: "var(--bg-surface)", animation: "pulse 1.5s infinite" }} />
      <div style={{ height: 100, borderRadius: 16, background: "var(--bg-surface)", animation: "pulse 1.5s infinite" }} />
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 24 }}>
        <div style={{ height: 180, borderRadius: 16, background: "var(--bg-surface)", animation: "pulse 1.5s infinite" }} />
        <div style={{ height: 180, borderRadius: 16, background: "var(--bg-surface)", animation: "pulse 1.5s infinite" }} />
      </div>
      <div style={{ height: 260, borderRadius: 16, background: "var(--bg-surface)", animation: "pulse 1.5s infinite" }} />
    </div>
  );
}
