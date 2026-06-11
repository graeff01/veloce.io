"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useClientSummary } from "@/components/client/use-client-summary";
import {
  PageWrap, ClientHeader, PeriodSelector, KpiCard, SectionCard,
  fmtBRL, fmtNum, fmtPct, fmtDur, growthLabel, growthColor,
} from "@/components/client/client-ui";

export default function ClientOverviewPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const { data, loading } = useClientSummary(year, month);

  return (
    <PageWrap>
      <ClientHeader
        title="Visão Geral"
        subtitle={data ? `${data.clientName} · ${data.periodLabel}` : "Resumo do período"}
        right={<PeriodSelector year={year} month={month} onYear={setYear} onMonth={setMonth} />}
      />

      {loading ? (
        <Center><Loader2 size={22} style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }} /></Center>
      ) : !data ? (
        <Empty />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
            <KpiCard label="Oportunidades" value={fmtNum(data.business.kpis.leads.value)} hint={growthLabel(data.business.kpis.leads.growthPct)} hintColor={growthColor(data.business.kpis.leads.growthPct)} />
            <KpiCard label="Investimento" value={fmtBRL(data.ads.spend)} hint={growthLabel(data.ads.spendGrowth)} hintColor={growthColor(data.ads.spendGrowth, true)} />
            <KpiCard label="CPL" value={fmtBRL(data.ads.cpl)} hint={growthLabel(data.ads.cplGrowth)} hintColor={growthColor(data.ads.cplGrowth, true)} />
            <KpiCard label="Conversões" value={fmtNum(data.business.kpis.conversoes.value)} hint={growthLabel(data.business.kpis.conversoes.growthPct)} hintColor={growthColor(data.business.kpis.conversoes.growthPct)} />
          </div>

          <SectionCard title="Saúde do atendimento">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 20 }}>
              <Mini label="Taxa de atendimento" value={fmtPct(data.business.attendance.attendanceRatePct)} />
              <Mini label="Tempo médio de resposta" value={fmtDur(data.business.attendance.avgResponseSec)} />
              <Mini label="Oportunidades sem resposta" value={fmtNum(data.business.attendance.unanswered)} danger={data.business.attendance.unanswered > 0} />
            </div>
          </SectionCard>

          {data.ads.insights.length > 0 && (
            <SectionCard title="Destaques do período">
              <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8 }}>
                {data.ads.insights.map((t, i) => (
                  <li key={i} style={{ fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>{t}</li>
                ))}
              </ul>
            </SectionCard>
          )}
        </div>
      )}
    </PageWrap>
  );
}

function Mini({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div>
      <p style={{ fontSize: 22, fontWeight: 700, color: danger ? "#B42318" : "var(--text-primary)", margin: 0, letterSpacing: "-0.02em" }}>{value}</p>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "5px 0 0" }}>{label}</p>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>{children}</div>;
}
function Empty() {
  return <div style={{ padding: 60, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>Dado indisponível para o período selecionado.</div>;
}
