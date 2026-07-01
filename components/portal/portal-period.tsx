"use client";

import { useRouter, usePathname } from "next/navigation";

// Seletor de período do portal: dropdown com "Últimos 7 dias" + os últimos meses.
// Navega via ?p= (week | YYYY-MM). Usado em Painel, Anúncios e IA (mesmo visual).
export function PortalPeriod({ selected, months }: { selected: string; months: { value: string; label: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <select
      value={selected}
      onChange={(e) => router.push(`${pathname}?p=${e.target.value}`)}
      style={{ marginLeft: "auto", background: "var(--p-bg)", border: "1px solid var(--p-border)", borderRadius: 11, padding: "7px 12px", fontSize: 13, fontWeight: 600, color: "var(--p-text)", cursor: "pointer", minWidth: 150 }}
    >
      <option value="week">Últimos 7 dias</option>
      {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
    </select>
  );
}
