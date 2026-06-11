"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useClientSummary } from "@/components/client/use-client-summary";
import {
  PageWrap, ClientHeader, PeriodSelector, KpiCard, SectionCard, Bar, WEEKDAYS,
  fmtNum, fmtPct, fmtDur,
} from "@/components/client/client-ui";

const HOUR_BANDS = [
  { label: "00–06h", from: 0, to: 6 },
  { label: "06–09h", from: 6, to: 9 },
  { label: "09–12h", from: 9, to: 12 },
  { label: "12–15h", from: 12, to: 15 },
  { label: "15–18h", from: 15, to: 18 },
  { label: "18–21h", from: 18, to: 21 },
  { label: "21–24h", from: 21, to: 24 },
];

export default function ClientWhatsAppPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const { data, loading } = useClientSummary(year, month);

  const b = data?.business;
  const bands = b ? HOUR_BANDS.map((band) => ({ label: band.label, count: b.behavior.byHour.slice(band.from, band.to).reduce((a, h) => a + h.count, 0) })) : [];
  const maxBand = Math.max(1, ...bands.map((x) => x.count));
  const maxWd = Math.max(1, ...(b?.behavior.byWeekday.map((w) => w.count) ?? [1]));

  return (
    <PageWrap>
      <ClientHeader
        title="WhatsApp"
        subtitle="Performance do atendimento — indicadores executivos"
        right={<PeriodSelector year={year} month={month} onYear={setYear} onMonth={setMonth} />}
      />

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Loader2 size={22} style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }} /></div>
      ) : !b || !b.hasData ? (
        <div style={{ padding: 60, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>Sem registros de atendimento no período. Dado indisponível.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14 }}>
            <KpiCard label="Oportunidades recebidas" value={fmtNum(b.kpis.leads.value)} />
            <KpiCard label="Tempo médio de resposta" value={fmtDur(b.attendance.avgResponseSec)} />
            <KpiCard label="Taxa de atendimento" value={fmtPct(b.attendance.attendanceRatePct)} />
            <KpiCard label="Sem resposta" value={fmtNum(b.attendance.unanswered)} />
          </div>

          <SectionCard title="Distribuição por horário de entrada">
            {bands.map((x) => <Bar key={x.label} label={x.label} count={x.count} max={maxBand} />)}
          </SectionCard>

          <SectionCard title="Distribuição por dia da semana">
            {b.behavior.byWeekday.map((w) => <Bar key={w.weekday} label={WEEKDAYS[w.weekday]} count={w.count} max={maxWd} />)}
          </SectionCard>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            <KpiCard label="Horário de maior demanda" value={b.behavior.peakHour != null ? `${String(b.behavior.peakHour).padStart(2, "0")}h` : "—"} />
            <KpiCard label="Dia de maior volume" value={b.behavior.peakWeekday != null ? WEEKDAYS[b.behavior.peakWeekday] : "—"} />
          </div>
        </div>
      )}
    </PageWrap>
  );
}
