"use client";

import { useRouter, usePathname } from "next/navigation";

// Seletor de período do portal: dropdown com "Últimos 7 dias" + os últimos meses.
// Navega via ?p= (week | YYYY-MM | tudo). Usado em Painel, Anúncios, IA e Funil.
//
// `incluirTudo` existe para o FUNIL: ele sempre mostrou o histórico inteiro, e
// passar a filtrar por mês mudaria o número que o cliente já conhece (1.846 →
// 575, na JR). Com a opção, o padrão continua o de hoje e ele ESCOLHE estreitar.
export function PortalPeriod({ selected, months, incluirTudo }: { selected: string; months: { value: string; label: string }[]; incluirTudo?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <select
      value={selected}
      onChange={(e) => router.push(`${pathname}?p=${e.target.value}`)}
      style={{ marginLeft: "auto", background: "var(--p-bg)", border: "1px solid var(--p-border)", borderRadius: 11, padding: "7px 12px", fontSize: 13, fontWeight: 600, color: "var(--p-text)", cursor: "pointer", minWidth: 150 }}
    >
      {incluirTudo && <option value="tudo">Todo o período</option>}
      <option value="week">Últimos 7 dias</option>
      {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
    </select>
  );
}
