// Auditoria do Google — fórmulas TRANSPARENTES e determinísticas (sem caixa-preta).
// Tudo derivado de fatos: diagnóstico real, parcela de impressões e desperdício
// (gasto com 0 conversão). Mesma entrada → mesma nota, sempre. Auditável.

export type HealthFactor = { label: string; delta: number };

// Desperdício = soma do gasto em buscas/keywords que NÃO converteram. Fato puro.
export function computeWaste(items: { spend: number; conversions: number }[]): { amount: number; count: number } {
  const wasted = items.filter((t) => t.conversions === 0 && t.spend > 0);
  return { amount: wasted.reduce((s, t) => s + t.spend, 0), count: wasted.length };
}

// Nota de saúde 0–100: começa em 100 e desconta por problema real, com pesos fixos
// e documentados. Retorna os fatores que mexeram na nota (pra exibir o "porquê").
export function accountHealth(opts: {
  impressionShare: number | null; // fração 0–1
  wasteRatio: number;             // gasto desperdiçado / gasto total (0–1)
  diagnostics: { kind: string; severity: string }[];
}): { score: number; label: string; color: string; factors: HealthFactor[] } {
  const factors: HealthFactor[] = [];
  let score = 100;
  const hit = (label: string, delta: number) => { if (delta) { factors.push({ label, delta }); score += delta; } };

  // Rastreamento de conversão é a base de tudo (sem ele, otimização é cega): −30.
  const hasConvDiag = opts.diagnostics.some((d) => d.kind === "conversion_tracking");
  const convOk = opts.diagnostics.some((d) => d.kind === "conversion_tracking" && d.severity === "ok");
  if (hasConvDiag && !convOk) hit("Rastreamento de conversão inativo", -30);

  // Anúncios reprovados: −10 cada (teto −20).
  const disapproved = opts.diagnostics.filter((d) => d.kind === "disapproved_ad").length;
  if (disapproved) hit(`${disapproved} anúncio(s) reprovado(s)`, -Math.min(20, disapproved * 10));

  // Campanhas limitadas por orçamento (perde demanda): −5 cada (teto −15).
  const budget = opts.diagnostics.filter((d) => d.kind === "budget_limited").length;
  if (budget) hit(`${budget} campanha(s) limitada(s) por orçamento`, -Math.min(15, budget * 5));

  // Desperdício: até −30, proporcional (50% desperdiçado já zera essa faixa).
  if (opts.wasteRatio > 0.01) hit(`Desperdício: ${Math.round(opts.wasteRatio * 100)}% do gasto sem conversão`, -Math.round(Math.min(30, opts.wasteRatio * 60)));

  // Parcela de impressões baixa (<50% = perdendo metade da demanda): até −20.
  if (opts.impressionShare != null && opts.impressionShare < 0.5) hit(`Captura baixa da demanda (${Math.round(opts.impressionShare * 100)}%)`, -Math.round((0.5 - opts.impressionShare) * 40));

  score = Math.max(0, Math.min(100, Math.round(score)));
  const label = score >= 85 ? "Excelente" : score >= 70 ? "Boa" : score >= 50 ? "Atenção" : "Crítica";
  const color = score >= 85 ? "#16A34A" : score >= 70 ? "#65A30D" : score >= 50 ? "#D97706" : "#DC2626";
  return { score, label, color, factors };
}
