// ── Prompt Compiler — o COMPILADOR ───────────────────────────────────────────────
// compilePrompt(input) → { prompt, report } (ver docs/rfc-prompt-compiler.md §4.2):
//  • resolve {{placeholders}} a partir dos parâmetros (fonte única, zero drift);
//  • ordena os módulos por tópico (fluxo de atendimento) e prioridade;
//  • monta identidade + políticas + ponteiros de conhecimento;
//  • roda o LINT (drift/duplicata/conflito/órfã/exemplo/placeholder) e devolve o relatório.
// Determinístico e auditável — NÃO usa LLM para reescrever (o LLM, no máximo, sugere candidatos).

import { approxTokens } from "@/lib/ai-agent/eval/prompt-audit";
import {
  lintConflicts,
  lintDrift,
  lintDuplicates,
  lintOrphanExamples,
  lintOrphanRefs,
} from "./lint";
import {
  TOPIC_ORDER,
  type CompileInput,
  type CompiledPrompt,
  type CompileParams,
  type LintIssue,
  type ModuleStat,
  type PolicyModule,
} from "./types";

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

// Resolve {{param}} → valor. Placeholder sem valor vira issue "unresolved-param" (erro) e é
// mantido visível no texto (nunca vai a produção porque compileOrThrow lança).
function resolveText(text: string, params: CompileParams | undefined, moduleId: string, issues: LintIssue[]): string {
  return text.replace(PLACEHOLDER, (_full, key: string) => {
    const v = params?.[key];
    if (v == null || v === "") {
      issues.push({ kind: "unresolved-param", severity: "error", moduleId, message: `{{${key}}} sem valor na config` });
      return `{{${key}}}`;
    }
    return String(v);
  });
}

// Ordem final: por tópico (fluxo) e, dentro do tópico, por prioridade e id (estável).
function orderModules(modules: PolicyModule[]): PolicyModule[] {
  const topicRank = new Map(TOPIC_ORDER.map((t, i) => [t, i]));
  return [...modules].sort((a, b) => {
    const ta = topicRank.get(a.topic) ?? 999;
    const tb = topicRank.get(b.topic) ?? 999;
    if (ta !== tb) return ta - tb;
    const pa = a.priority ?? 100;
    const pb = b.priority ?? 100;
    if (pa !== pb) return pa - pb;
    return a.id.localeCompare(b.id);
  });
}

function renderModule(m: PolicyModule, resolvedText: string): string {
  let block = resolvedText.trim();
  if (m.examples?.length) {
    block += "\n" + m.examples.map((e) => `ex.: ${e}`).join("\n");
  }
  return block;
}

export function compilePrompt(input: CompileInput): CompiledPrompt {
  const { identity, modules, params, knowledge } = input;
  const issues: LintIssue[] = [];

  // Lints que olham as FONTES (antes de montar): drift, duplicata, conflito, exemplo órfão.
  issues.push(...lintDrift(modules, params));
  issues.push(...lintDuplicates(modules));
  issues.push(...lintConflicts(modules));
  issues.push(...lintOrphanExamples(modules));

  // Monta o prompt resolvendo placeholders.
  const ordered = orderModules(modules);
  const perModule: ModuleStat[] = [];
  const parts: string[] = [];
  if (identity?.trim()) parts.push(identity.trim());

  for (const m of ordered) {
    const resolved = resolveText(m.text, params, m.id, issues);
    const block = renderModule(m, resolved);
    parts.push(block);
    perModule.push({ id: m.id, topic: m.topic, chars: block.length, approxTokens: approxTokens(block) });
  }

  if (knowledge?.length) {
    parts.push("CONHECIMENTO — consulte quando:\n" + knowledge.map((k) => `- ${k}`).join("\n"));
  }

  const prompt = parts.join("\n\n");

  // Lint que olha o prompt MONTADO: referências órfãs ("ver seção X").
  issues.push(...lintOrphanRefs(prompt));

  const ok = !issues.some((i) => i.severity === "error");
  return {
    prompt,
    report: { chars: prompt.length, approxTokens: approxTokens(prompt), perModule, issues, ok },
  };
}

// Versão que FALHA o build (uso em CI / adoção): lança se houver qualquer issue "error".
export function compileOrThrow(input: CompileInput): CompiledPrompt {
  const res = compilePrompt(input);
  if (!res.report.ok) {
    const errs = res.report.issues.filter((i) => i.severity === "error");
    const msg = errs.map((e) => `  [${e.kind}]${e.moduleId ? ` (${e.moduleId})` : ""} ${e.message}`).join("\n");
    throw new Error(`Prompt Compiler: ${errs.length} erro(s) de lint — build bloqueado:\n${msg}`);
  }
  return res;
}
