// ── Prompt Compiler — LINT (read-only) ──────────────────────────────────────────
// Primeira peça do Prompt Compiler (ver docs/rfc-prompt-compiler.md): analisa o customPrompt
// SEM alterá-lo e aponta os problemas de manutenção que o crescimento orgânico gera. É
// estritamente OBSERVACIONAL — não muda o prompt nem o comportamento da IA. A consolidação
// (que muda o texto) é outra etapa e passa pela simulação. Helpers puros (testáveis).

// 1) DRIFT — números de negócio que vivem NO PROMPT e TAMBÉM na config (fonte de verdade).
// Se a config mudar e o prompt não, a IA fala um número e o motor aplica outro. Aqui só
// checamos se o número da config APARECE no prompt; ausência = sinal de drift para revisar.
export interface ParamCheck { label: string; expected: string; present: boolean }
export function checkDrift(prompt: string, params: { label: string; value: string | number | null | undefined }[]): ParamCheck[] {
  const out: ParamCheck[] = [];
  for (const p of params) {
    if (p.value == null || p.value === "") continue;
    const v = String(p.value);
    // procura o número "solto" (com fronteira), tolerando vírgula/ponto decimal
    const re = new RegExp(`(?<![\\d.,])${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\d.,%])?`);
    out.push({ label: p.label, expected: v, present: re.test(prompt) });
  }
  return out;
}

// 2) DUPLICAÇÃO — quantas vezes cada CONCEITO de regra aparece. Não é dedupe automático
// (isso muda o texto); é só o mapa de onde o mesmo conceito foi repetido, pra revisão humana.
export interface DupConcept { concept: string; count: number }
export function countConcepts(prompt: string, concepts: { concept: string; re: RegExp }[]): DupConcept[] {
  return concepts
    .map(({ concept, re }) => ({ concept, count: (prompt.match(new RegExp(re, "gi")) ?? []).length }))
    .filter((c) => c.count > 1) // só o que está DUPLICADO (2+)
    .sort((a, b) => b.count - a.count);
}

// 3) REFERÊNCIAS ÓRFÃS — "ver seção X" onde X não existe como cabeçalho no prompt.
export function findOrphanRefs(prompt: string): string[] {
  const orphans: string[] = [];
  const refRe = /ver seção ([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ \/]{3,40})/gi;
  let m: RegExpExecArray | null;
  while ((m = refRe.exec(prompt))) {
    const name = m[1].trim().replace(/[).,]+$/, "");
    // existe um cabeçalho começando com esse nome (fora da própria referência)?
    const headerRe = new RegExp(`(^|\\n)\\s*${name.slice(0, 12).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
    const withoutRef = prompt.replace(m[0], "");
    if (!headerRe.test(withoutRef)) orphans.push(name);
  }
  return [...new Set(orphans)];
}

// Tamanho aproximado em tokens (heurística pt-BR ~4 chars/token).
export const approxTokens = (s: string) => Math.ceil(s.length / 4);
