import { prismaUnscoped } from "@/lib/prisma";

// ── Sprint 4: Prompt A/B ───────────────────────────────────────────────────────
// Atribuição DETERMINÍSTICA por contato (o mesmo lead sempre cai na mesma variante →
// experimento limpo). A variante aplica overrides no prompt base e é registrada na
// AiInteraction (promptVariant) para comparar métricas por versão.

export interface VariantLike { key: string; weight: number }

// Hash estável (djb2) de string → inteiro não-negativo. Puro/testável.
export function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

// Escolhe uma variante por peso, de forma determinística pelo seed (contactId).
export function pickWeighted<T extends VariantLike>(variants: T[], seed: string): T | null {
  const active = variants.filter((v) => v.weight > 0);
  if (active.length === 0) return null;
  const total = active.reduce((s, v) => s + v.weight, 0);
  let pos = hashString(seed) % total;
  for (const v of active) { if (pos < v.weight) return v; pos -= v.weight; }
  return active[active.length - 1];
}

export interface ResolvedVariant {
  key: string;
  personaOverride: string | null;
  goalsOverride: string | null;
  rulesOverride: string | null;
  extraInstructions: string | null;
}

export async function resolveVariant(clientId: string, contactId: string): Promise<ResolvedVariant | null> {
  const variants = await prismaUnscoped.promptVariant.findMany({
    where: { clientId, active: true },
    select: { key: true, weight: true, personaOverride: true, goalsOverride: true, rulesOverride: true, extraInstructions: true },
  }).catch(() => []);
  if (variants.length === 0) return null;
  const chosen = pickWeighted(variants, contactId);
  if (!chosen) return null;
  return {
    key: chosen.key,
    personaOverride: chosen.personaOverride, goalsOverride: chosen.goalsOverride,
    rulesOverride: chosen.rulesOverride, extraInstructions: chosen.extraInstructions,
  };
}
