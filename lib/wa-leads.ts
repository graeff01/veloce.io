// Derivação de Novo / Recorrente / Reativado — sem campo novo no banco.
// Base: createdAt do contato (1ª vez que falou) vs início do período +
// silêncio antes da atividade do período.

export type LeadBadge = "novo" | "recorrente" | "reativado";

const REACTIVATION_GAP_MS = 30 * 24 * 3_600_000; // 30 dias

export function deriveBadge(opts: {
  createdAt: Date;
  periodStart: Date;
  prevActivityBefore?: Date | null;   // última atividade ANTES do período
  firstActivityInPeriod?: Date | null; // 1ª atividade DENTRO do período
}): LeadBadge {
  if (opts.createdAt >= opts.periodStart) return "novo";
  if (opts.prevActivityBefore && opts.firstActivityInPeriod) {
    if (opts.firstActivityInPeriod.getTime() - opts.prevActivityBefore.getTime() >= REACTIVATION_GAP_MS) {
      return "reativado";
    }
  }
  return "recorrente";
}

export const BADGE_LABEL: Record<LeadBadge, string> = {
  novo: "Novo", recorrente: "Recorrente", reativado: "Reativado",
};
export const BADGE_COLOR: Record<LeadBadge, string> = {
  novo: "#16A34A", recorrente: "#3B82F6", reativado: "#D97706",
};

export function monthStart(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// Nome canônico do anúncio: funde variações do mesmo carro num único rótulo.
// Usa o modelo detectado quando existe; senão, o título do anúncio cortado no
// 1º separador (" - ", " | ", "—"). Ex.: model "Taos Highline" e título
// "Taos Highline - Teu SUV premium tá aqui!" colapsam em "Taos Highline".
// Fonte única usada pela auditoria, pelo overview e pelo portal.
export function canonicalAdName(model: string | null, title: string | null): string {
  if (model && model.trim()) return model.trim();
  const t = (title ?? "").trim();
  if (!t) return "Anúncio (sem título)";
  return t.split(/\s+[-–—|]\s+/)[0].trim() || t;
}
