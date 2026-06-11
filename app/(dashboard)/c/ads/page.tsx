"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useClientSummary } from "@/components/client/use-client-summary";
import {
  PageWrap, ClientHeader, PeriodSelector, KpiCard, SectionCard,
  fmtBRL, fmtNum, fmtPct, growthLabel, growthColor,
} from "@/components/client/client-ui";

export default function ClientAdsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const { data, loading } = useClientSummary(year, month);

  const ads = data?.ads;

  return (
    <PageWrap>
      <ClientHeader
        title="Ads Intelligence"
        subtitle="Resultado dos investimentos — foco em oportunidades e conversão"
        right={<PeriodSelector year={year} month={month} onYear={setYear} onMonth={setMonth} />}
      />

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Loader2 size={22} style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }} /></div>
      ) : !ads || !ads.hasData ? (
        <div style={{ padding: 60, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>Sem investimento registrado no período. Dado indisponível.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14 }}>
            <KpiCard label="Investimento" value={fmtBRL(ads.spend)} hint={growthLabel(ads.spendGrowth)} hintColor={growthColor(ads.spendGrowth, true)} />
            <KpiCard label="Oportunidades" value={fmtNum(ads.leads)} hint={growthLabel(ads.leadsGrowth)} hintColor={growthColor(ads.leadsGrowth)} />
            <KpiCard label="CPL" value={fmtBRL(ads.cpl)} hint={growthLabel(ads.cplGrowth)} hintColor={growthColor(ads.cplGrowth, true)} />
            <KpiCard label="Conversões" value={fmtNum(ads.conversoes)} />
            <KpiCard label="Taxa de conversão" value={fmtPct(ads.taxaConversao)} />
          </div>

          {ads.insights.length > 0 && (
            <SectionCard title="Insights automáticos">
              <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 10 }}>
                {ads.insights.map((t, i) => (
                  <li key={i} style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5 }}>{t}</li>
                ))}
              </ul>
            </SectionCard>
          )}
        </div>
      )}
    </PageWrap>
  );
}
