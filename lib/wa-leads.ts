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
