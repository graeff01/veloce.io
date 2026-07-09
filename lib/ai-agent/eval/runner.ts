// ── Motor de avaliação (eval harness) ────────────────────────────────────────
// Carrega os goldens de evals/cases/*.json, roda cada um pelo MESMO orquestrador
// (modo "test" — não grava, não envia), aplica as asserções determinísticas e,
// se houver API key, o juiz LLM. Retorna um relatório com passou/falhou por caso.
//
// Roda contra a config REAL de um cliente (clientId), porque é o comportamento
// desse agente que queremos travar. As asserções dos casos são propositalmente
// agnósticas de vertical (ex: "nunca inventar preço"), então servem a qualquer
// tenant.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runAgent } from "@/lib/ai-agent/orchestrator";
import type { ChatMessage } from "@/lib/openai";
import { judgeReply } from "./judge";
import type { CaseResult, CheckResult, EvalCase, EvalReport } from "./types";

const CASES_DIR = join(process.cwd(), "evals", "cases");

export function loadCases(dir: string = CASES_DIR): EvalCase[] {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const cases: EvalCase[] = [];
  for (const f of files) {
    const parsed = JSON.parse(readFileSync(join(dir, f), "utf8"));
    // Um arquivo pode conter um caso ou um array de casos.
    for (const c of Array.isArray(parsed) ? parsed : [parsed]) cases.push(c as EvalCase);
  }
  return cases;
}

function asArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function runChecks(c: EvalCase, reply: string, decisao: string, status: string, tools: string[]): CheckResult[] {
  const checks: CheckResult[] = [];
  const e = c.espera;

  const decisoes = asArray(e.decisao);
  if (decisoes.length) {
    checks.push({
      nome: `decisão ∈ {${decisoes.join(", ")}}`,
      passou: decisoes.includes(decisao),
      detalhe: `obtido: ${decisao}`,
    });
  }

  for (const t of e.usaFerramenta ?? []) {
    checks.push({ nome: `usa ferramenta ${t}`, passou: tools.includes(t), detalhe: `tools: ${tools.join(", ") || "—"}` });
  }
  for (const t of e.naoUsaFerramenta ?? []) {
    checks.push({ nome: `NÃO usa ferramenta ${t}`, passou: !tools.includes(t), detalhe: `tools: ${tools.join(", ") || "—"}` });
  }

  for (const p of e.proibido ?? []) {
    const re = new RegExp(p, "i");
    checks.push({ nome: `proibido /${p}/`, passou: !re.test(reply), detalhe: re.test(reply) ? "apareceu na resposta" : undefined });
  }
  for (const p of e.obrigatorio ?? []) {
    const re = new RegExp(p, "i");
    checks.push({ nome: `obrigatório /${p}/`, passou: re.test(reply), detalhe: re.test(reply) ? undefined : "faltou na resposta" });
  }

  if (e.naoPodeBloquear) {
    checks.push({ nome: "não pode ser bloqueada pelo guardrail", passou: status !== "blocked", detalhe: `status: ${status}` });
  }

  return checks;
}

export async function runEvals(opts: { clientId: string; judgeModel: string | null; casesDir?: string }): Promise<EvalReport> {
  const startedAt = new Date();
  const cases = loadCases(opts.casesDir ?? CASES_DIR);
  const results: CaseResult[] = [];

  for (const c of cases) {
    const transcript: ChatMessage[] = (c.historico ?? []).map((t) => ({ role: t.role, content: t.content }));
    try {
      const out = await runAgent(
        {
          clientId: opts.clientId,
          connectionId: "eval",
          contact: { id: `eval-${c.id}`, name: "Lead (eval)", waId: "0000000000" },
          inboundText: c.mensagem,
        },
        { mode: "test", transcript },
      );

      const reply = out.reply ?? "";
      const tools = (out.toolCalls ?? []).map((t) => t.name);
      const checks = runChecks(c, reply, out.decision, out.status, tools);

      let judge: CaseResult["judge"] = null;
      if (c.espera.rubrica && opts.judgeModel && reply) {
        judge = await judgeReply({ model: opts.judgeModel, mensagem: c.mensagem, reply, rubrica: c.espera.rubrica });
      }

      const passou = checks.every((ch) => ch.passou) && (judge ? judge.passou : true);
      results.push({
        id: c.id, descricao: c.descricao, passou, reply,
        decisao: out.decision, status: out.status, toolCalls: tools, checks, judge,
      });
    } catch (err) {
      results.push({
        id: c.id, descricao: c.descricao, passou: false, reply: null,
        decisao: "erro", status: "error", toolCalls: [], checks: [], erro: String(err),
      });
    }
  }

  const passaram = results.filter((r) => r.passou).length;
  return {
    total: results.length,
    passaram,
    falharam: results.length - passaram,
    casos: results,
    clientId: opts.clientId,
    judgeModel: opts.judgeModel,
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
  };
}
