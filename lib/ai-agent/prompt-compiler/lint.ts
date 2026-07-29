// ── Prompt Compiler — LINT que FALHA o build ─────────────────────────────────────
// Diferente do prompt-audit (read-only, aponta problemas num blob legado), este lint roda
// DENTRO do compilador sobre as fontes estruturadas e retorna issues. Um issue "error" faz
// compileOrThrow lançar → impede que um prompt com regressão arquitetural chegue a produção.
// Reaproveita os detectores puros do prompt-audit (órfãs) e adiciona os do modelo estruturado.

import { findOrphanRefs } from "@/lib/ai-agent/eval/prompt-audit";
import type { CompileParams, LintIssue, PolicyModule } from "./types";

const numToken = (v: string) =>
  new RegExp(`(?<![\\d.,])${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\d.,])`);

// DRIFT — um valor de parâmetro (ex.: 250, 8) aparece LITERAL no texto de um módulo em vez de
// vir por {{placeholder}}. Fonte dupla = a IA fala um número e o motor aplica outro. Só olha o
// texto CRU (pré-resolução): se o módulo já usa {{key}}, o literal resolvido não conta.
export function lintDrift(modules: PolicyModule[], params: CompileParams | undefined): LintIssue[] {
  if (!params) return [];
  const out: LintIssue[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    const lit = String(value);
    if (lit.length < 2) continue; // 1 dígito solto gera falso-positivo demais
    const re = numToken(lit);
    for (const m of modules) {
      const usesPlaceholder = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`).test(m.text);
      const rawText = m.text.replace(/\{\{[^}]+\}\}/g, ""); // ignora o que já é placeholder
      if (!usesPlaceholder && re.test(rawText)) {
        out.push({
          kind: "drift",
          severity: "error",
          moduleId: m.id,
          message: `número ${lit} (parâmetro "${key}") está literal no texto — use {{${key}}}`,
        });
      }
    }
  }
  return out;
}

// DUPLICATA — dois módulos com o mesmo `intent` são o mesmo conceito escrito duas vezes. É
// permitido SE os extras forem reforço deliberado (reforco:true). 2+ canônicos = erro.
export function lintDuplicates(modules: PolicyModule[]): LintIssue[] {
  const byIntent = new Map<string, PolicyModule[]>();
  for (const m of modules) {
    if (!m.intent) continue;
    (byIntent.get(m.intent) ?? byIntent.set(m.intent, []).get(m.intent)!).push(m);
  }
  const out: LintIssue[] = [];
  for (const [intent, group] of byIntent) {
    if (group.length < 2) continue;
    const canonical = group.filter((m) => !m.reforco);
    if (canonical.length > 1) {
      out.push({
        kind: "duplicate",
        severity: "error",
        message: `intent "${intent}" repetido sem reforço em: ${canonical.map((m) => m.id).join(", ")} — deixe 1 canônico e marque os demais reforco:true (ou remova)`,
      });
    }
  }
  return out;
}

// CONFLITO — se um módulo declara conflitaCom, TEM que existir um desempate (fronteira escrita)
// em algum dos lados. Sem isso, o modelo escolhe uma regra ao acaso (C1/C2 do RFC).
export function lintConflicts(modules: PolicyModule[]): LintIssue[] {
  const byId = new Map(modules.map((m) => [m.id, m]));
  const out: LintIssue[] = [];
  const seen = new Set<string>();
  for (const m of modules) {
    for (const otherId of m.conflitaCom ?? []) {
      const pair = [m.id, otherId].sort().join("|");
      if (seen.has(pair)) continue;
      seen.add(pair);
      const other = byId.get(otherId);
      const hasDesempate = !!m.desempate || !!other?.desempate;
      if (!hasDesempate) {
        out.push({
          kind: "conflict",
          severity: "error",
          moduleId: m.id,
          message: `conflito ${m.id} × ${otherId} sem desempate declarado — escreva a fronteira em .desempate`,
        });
      }
    }
  }
  return out;
}

// EXEMPLO ÓRFÃO — "ex.:"/"exemplo:" inline no texto. Exemplos devem morar em examples[] (1 dono).
export function lintOrphanExamples(modules: PolicyModule[]): LintIssue[] {
  const out: LintIssue[] = [];
  for (const m of modules) {
    if (/\b(ex\.:|exemplo:)/i.test(m.text)) {
      out.push({
        kind: "orphan-example",
        severity: "warn",
        moduleId: m.id,
        message: `exemplo inline no texto — mova para examples[]`,
      });
    }
  }
  return out;
}

// REFERÊNCIA ÓRFÃ — "ver seção X" sem cabeçalho alvo no prompt montado (reusa o prompt-audit).
export function lintOrphanRefs(compiledPrompt: string): LintIssue[] {
  return findOrphanRefs(compiledPrompt).map((name) => ({
    kind: "orphan-ref" as const,
    severity: "error" as const,
    message: `referência órfã: "ver seção ${name}" não tem alvo`,
  }));
}
