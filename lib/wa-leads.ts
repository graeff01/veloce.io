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

// Limpa um rótulo de anúncio: corta no 1º fim de frase (. ? !) OU separador
// (" - ", " | ", "—"), tira pontuação solta e limita a ~5 palavras. Assim
// "Taos Highline. Bom dia, qual o ano?" → "Taos Highline".
function cleanAdLabel(s: string): string {
  let v = s.split(/[.?!\n]|\s+[-–—|]\s+/)[0].trim();
  v = v.replace(/[,;:]+$/u, "").replace(/\s+/g, " ").trim();
  const words = v.split(" ");
  if (words.length > 5) v = words.slice(0, 5).join(" ");
  return v;
}

// Nome canônico do anúncio: funde variações do mesmo carro num único rótulo.
// Usa o modelo detectado quando existe; senão, o título — sempre limpo.
// Ex.: model "Taos Highline" e título "Taos Highline - Teu SUV premium" colapsam.
// Fonte única usada pela auditoria e pelo overview.
export function canonicalAdName(model: string | null, title: string | null): string {
  const base = (model && model.trim()) ? model.trim() : (title ?? "").trim();
  if (!base) return "Anúncio (sem título)";
  return cleanAdLabel(base) || base;
}
