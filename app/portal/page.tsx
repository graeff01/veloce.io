"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PortalNav } from "@/components/portal/portal-nav";
import { LineChart } from "@/components/portal/line-chart";
import { ArrowRight, TrendingUp, TrendingDown } from "lucide-react";

interface Resumo {
  clientName: string;
  monthLabel: string;
  updatedAt: string | null;
  connected: boolean;
  leads: number;
  leadsPrev: number;
  convertido: number;
  convertidoPrev: number;
  responded: number;
  semResposta: number;
  responseRate: number; // 0..1
  avgFirstResponseSec: number | null;
  negociacao: number;
  investimento: number;
  cplReal: number | null;
  series: { date: string; leads: number }[];
}

const num: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };
const CHART_COLOR = "#6366F1";
const META_RESPOSTA_SEC = 30 * 60; // meta: 30 min

function fmtMoney(v: number, decimals = 0): string {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}
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
function growth(cur: number, prev: number): number | null {
  if (prev <= 0) return null;
  return ((cur - prev) / prev) * 100;
}
function buildDailySeries(series: { date: string; leads: number }[]): { date: string; value: number }[] {
  const map = new Map(series.map((s) => [s.date, s.leads]));
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth(), today = now.getDate();
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

export default function PortalHome() {
  const router = useRouter();
  const [d, setD] = useState<Resumo | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    fetch("/api/portal/v1/auth/me")
      .then((r) => { if (!r.ok) { router.replace("/portal/login"); return; } setAuthChecked(true); })
      .catch(() => router.replace("/portal/login"));
    fetch("/api/portal/v1/resumo")
      .then((r) => (r.ok ? r.json() : null))
      .then((x: Resumo | null) => { if (x) setD(x); });
  }, [router]);

  if (!authChecked || !d) return <div><PortalNav /><Skeleton /></div>;

  const taxa = Math.round(d.responseRate * 100);
  const hasData = d.leads > 0;
  const leadsGrowth = growth(d.leads, d.leadsPrev);
  const series = buildDailySeries(d.series);

  // Status de saúde (executivo, sem detalhe operacional)
  const atendimentoOk = taxa >= 70;
  const velocidadeOk = d.avgFirstResponseSec != null && d.avgFirstResponseSec <= META_RESPOSTA_SEC;

  return (
    <div>
      <PortalNav />
      <main
        className="portal-rise"
        style={{ padding: "32px clamp(20px, 4vw, 48px) 48px", display: "flex", flexDirection: "column", gap: 28 }}
      >
        {/* ── HERO EXECUTIVO ── */}
        <section>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)", margin: 0 }}>
            {saudacao()}, {d.clientName}
          </h1>
          {hasData ? (
            <p style={{ fontSize: 17, lineHeight: 1.7, color: "var(--text-secondary)", margin: "14px 0 0", maxWidth: 760 }}>
              Em <B>{d.monthLabel}</B> você recebeu <B>{d.leads} oportunidades</B> através dos canais conectados.
              {d.avgFirstResponseSec != null && <> Tempo médio de resposta: <B>{fmtDuration(d.avgFirstResponseSec)}</B>.</>}{" "}
              <span style={{ color: atendimentoOk ? "var(--green)" : "var(--amber)", fontWeight: 600 }}>
                {atendimentoOk ? "Atendimento saudável." : "Atendimento precisa de atenção."}
              </span>{" "}
              {leadsGrowth != null && (
                <span style={{ color: leadsGrowth >= 0 ? "var(--green)" : "var(--text-muted)", fontWeight: 600 }}>
                  {leadsGrowth >= 0 ? "Tendência positiva" : "Queda"} em relação ao período anterior.
                </span>
              )}
            </p>
          ) : (
            <p style={{ fontSize: 16, lineHeight: 1.7, color: "var(--text-muted)", margin: "14px 0 0", maxWidth: 680 }}>
              Seus canais já estão conectados. Assim que as primeiras oportunidades chegarem, seu resumo aparece aqui.
            </p>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
            <span className="live-dot" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--green)", boxShadow: "0 0 0 3px var(--green-soft)" }} />
            <span style={{ fontSize: 12.5, color: "var(--text-muted)", textTransform: "capitalize" }}>{d.monthLabel} · atualizado em tempo real</span>
          </div>
        </section>

        {/* ── BLOCO 1 — RESULTADOS ── */}
        <section>
          <SectionLabel>Resultados</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            <BigCard
              label="Oportunidades"
              value={String(d.leads)}
              footer={leadsGrowth != null
                ? <Delta v={leadsGrowth} suffix="vs. período anterior" />
                : <Muted>sem base de comparação</Muted>}
            />
            <BigCard
              label="Investimento"
              value={d.investimento > 0 ? fmtMoney(d.investimento) : "Dado indisponível"}
              dim={d.investimento <= 0}
              footer={<Muted>{d.investimento > 0 ? "via Meta Ads" : "conecte os anúncios"}</Muted>}
            />
            <BigCard
              label="Custo por oportunidade"
              value={d.cplReal != null ? fmtMoney(d.cplReal, 2) : "Dado indisponível"}
              dim={d.cplReal == null}
              accent
              footer={<Muted>investimento ÷ leads de anúncio</Muted>}
            />
            <BigCard
              label="Conversões"
              value={String(d.convertido)}
              footer={growth(d.convertido, d.convertidoPrev) != null
                ? <Delta v={growth(d.convertido, d.convertidoPrev)!} suffix="vs. período anterior" />
                : <Muted>negócios fechados</Muted>}
            />
          </div>
        </section>

        {/* ── BLOCO 2 — SAÚDE DA OPERAÇÃO ── */}
        <section>
          <SectionLabel>Saúde da operação</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
            <HealthCard
              status={!hasData ? "muted" : atendimentoOk ? "good" : "warn"}
              title={atendimentoOk ? "Atendimento saudável" : "Atendimento em atenção"}
              detail={hasData ? `${taxa}% das oportunidades atendidas` : "Dado indisponível"}
            />
            <HealthCard
              status={!hasData || d.avgFirstResponseSec == null ? "muted" : velocidadeOk ? "good" : "warn"}
              title="Velocidade de resposta"
              detail={d.avgFirstResponseSec != null ? `${fmtDuration(d.avgFirstResponseSec)} em média` : "Dado indisponível"}
            />
            <HealthCard
              status={!hasData ? "muted" : d.semResposta > 0 ? "warn" : "good"}
              title={d.semResposta > 0 ? "Atenção necessária" : "Tudo respondido"}
              detail={hasData ? (d.semResposta > 0 ? `${d.semResposta} oportunidades sem retorno` : "Nenhuma oportunidade sem retorno") : "Dado indisponível"}
            />
          </div>
        </section>

        {/* ── BLOCO 3 — EVOLUÇÃO (compacto) ── */}
        <section>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <SectionLabel noMargin>Tendência de oportunidades</SectionLabel>
            <Link href="/portal/evolucao" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 600, color: "var(--accent)", textDecoration: "none" }}>
              Ver evolução completa <ArrowRight size={13} />
            </Link>
          </div>
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "var(--shadow-card)", padding: "20px 22px" }}>
            {hasData && series.length > 1 ? (
              <LineChart data={series} color={CHART_COLOR} height={120} showDates />
            ) : (
              <p style={{ fontSize: 13.5, color: "var(--text-muted)", margin: 0, padding: "28px 0", textAlign: "center" }}>
                A tendência aparece conforme as oportunidades chegam.
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

/* ──────────────── Componentes ──────────────── */
function B({ children }: { children: React.ReactNode }) {
  return <strong style={{ fontWeight: 700, color: "var(--text-primary)" }}>{children}</strong>;
}
function Muted({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{children}</span>;
}
function Delta({ v, suffix }: { v: number; suffix: string }) {
  const up = v >= 0;
  const color = up ? "var(--green)" : "var(--red)";
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color, fontWeight: 700, ...num }}>
        <Icon size={12} />{Math.abs(v).toFixed(0)}%
      </span>
      <span style={{ color: "var(--text-muted)" }}>{suffix}</span>
    </span>
  );
}
function SectionLabel({ children, noMargin }: { children: React.ReactNode; noMargin?: boolean }) {
  return (
    <h2 style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", margin: noMargin ? 0 : "0 0 12px" }}>
      {children}
    </h2>
  );
}
function BigCard({ label, value, footer, accent, dim }: { label: string; value: string; footer?: React.ReactNode; accent?: boolean; dim?: boolean }) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 16, boxShadow: "var(--shadow-card)", padding: "22px 24px", display: "flex", flexDirection: "column", gap: 14, minHeight: 132 }}>
      <p style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text-muted)" }}>{label}</p>
      <p style={{ ...num, fontSize: dim ? 18 : 36, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1, color: dim ? "var(--text-muted)" : accent ? "var(--accent)" : "var(--text-primary)", marginTop: "auto" }}>
        {value}
      </p>
      <div style={{ minHeight: 16 }}>{footer}</div>
    </div>
  );
}
function HealthCard({ status, title, detail }: { status: "good" | "warn" | "muted"; title: string; detail: string }) {
  const color = status === "good" ? "var(--green)" : status === "warn" ? "var(--amber)" : "var(--text-muted)";
  const soft = status === "good" ? "var(--green-soft)" : status === "warn" ? "var(--amber-soft)" : "var(--bg-elevated)";
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 16, boxShadow: "var(--shadow-card)", padding: "20px 22px", display: "flex", alignItems: "flex-start", gap: 13 }}>
      <span style={{ width: 11, height: 11, borderRadius: "50%", background: color, boxShadow: `0 0 0 4px ${soft}`, marginTop: 4, flexShrink: 0 }} />
      <div>
        <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>{title}</p>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 0" }}>{detail}</p>
      </div>
    </div>
  );
}
function Skeleton() {
  return (
    <div style={{ padding: "32px clamp(20px, 4vw, 48px)", display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ height: 80, width: "60%", borderRadius: 12, background: "var(--bg-surface)", animation: "pulse 1.5s infinite" }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        {[0, 1, 2, 3].map((i) => <div key={i} style={{ height: 132, borderRadius: 16, background: "var(--bg-surface)", animation: "pulse 1.5s infinite" }} />)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {[0, 1, 2].map((i) => <div key={i} style={{ height: 80, borderRadius: 16, background: "var(--bg-surface)", animation: "pulse 1.5s infinite" }} />)}
      </div>
      <div style={{ height: 170, borderRadius: 14, background: "var(--bg-surface)", animation: "pulse 1.5s infinite" }} />
    </div>
  );
}
