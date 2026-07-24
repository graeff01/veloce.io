// ── Golden gate: prova de comportamento IDÊNTICO (Fase 0 do RFC de escala) ─────
// Complementa o runner de asserções (runner.ts). Enquanto aquele checa INVARIANTES
// ("nunca inventar preço"), este congela a IMPRESSÃO DIGITAL COMPORTAMENTAL do código
// atual e detecta DRIFT após qualquer refatoração do Runtime. É o gate que autoriza (ou
// barra) cada fase: se uma mudança de arquitetura alterar o que o cliente recebe —
// a decisão, as tools que disparam, o envio de foto/PDF/vídeo — ele acusa antes do merge.
//
// Lida com a natureza ESTOCÁSTICA do modelo: em vez de exigir texto igual (impossível a
// temp>0), captura por caso o CONJUNTO de assinaturas ESTRUTURAIS vistas em N execuções.
// Uma versão nova passa se sua assinatura ∈ conjunto do baseline. Variação legítima de
// redação não falha; mudança estrutural (parou de mandar foto, trocou a decisão) falha.
//
// Recomendação de uso: rode o gate com AI_CHAT_TEMPERATURE=0 para reprodutibilidade
// (o gate mede o efeito da MUDANÇA DE CÓDIGO com o modelo constante; a temperatura de
// produção segue configurada normalmente e não é afetada por isto).

import { runAgent } from "@/lib/ai-agent/orchestrator";
import type { RunOutput } from "@/lib/ai-agent/orchestrator";
import type { ChatMessage } from "@/lib/openai";
import { loadCases } from "./runner";
import type { EvalCase } from "./types";

// Tools que produzem EFEITO OBSERVÁVEL pelo cliente (mandam mídia, escalam p/ vendedor,
// reagem, pedem localização). Mudança aqui = mudança de comportamento → entra no gate HARD.
const OBSERVABLE_TOOLS = new Set([
  "enviar_foto", "enviar_video", "enviar_catalogo", "enviar_opcionais",
  "enviar_localizacao_loja", "pedir_localizacao", "enviar_orcamento",
  "escalar_humano", "aprovar_orcamento", "reagir",
]);
// As demais (buscar_estoque, atualizar_perfil, atualizar_ficha, gerar_orcamento) são
// LEITURAS/registros internos: não são percebidas pelo cliente e variam legitimamente
// (ex.: reconsultar o estoque × usar o que já está no contexto). Ficam FORA do gate hard
// (viram sinal informativo), senão o gate acusa falso-positivo. Fundamentado no baseline
// real (2026-07-24): 6/9 casos variavam só por `buscar_estoque` redundante.

// Impressão digital ESTRUTURAL de um turno — o que define o COMPORTAMENTO observável
// pelo cliente. Texto e leituras internas NÃO entram aqui; vão nos sinais soft/informativo.
export interface StructuralSig {
  decision: string;       // decisão do orquestrador (dirige handoff) — observável em efeito
  status: string;         // ok | blocked | error | skipped
  actions: string[];      // tools OBSERVÁVEIS chamadas, ordenadas (multiset canônico)
  artifacts: string[];    // kinds de artefato enviados (image|pdf|video|audio|location_request), ordenados
  reads: string[];        // tools internas (informativo — NÃO entra em sigKey)
}

export interface CaseBaseline {
  id: string;
  descricao: string;
  signatures: string[];         // assinaturas estruturais DISTINTAS vistas nas N execuções
  samples: {                    // amostras de referência (p/ o sinal soft de texto)
    sig: string;
    reply: string;
    toolArgs: { name: string; args: unknown }[];
  }[];
  runs: number;
}

export interface GoldenBaseline {
  clientId: string;
  createdAt: string;
  runs: number;
  temperature: string;          // AI_CHAT_TEMPERATURE em vigor na captura (rastreabilidade)
  casesDir: string;             // conjunto de casos usado (evita comparar contra o dir errado)
  casos: CaseBaseline[];
}

export function structuralSig(out: RunOutput): StructuralSig {
  const names = (out.toolCalls ?? []).map((t) => t.name);
  return {
    decision: out.decision,
    status: out.status,
    actions: names.filter((n) => OBSERVABLE_TOOLS.has(n)).sort(),
    artifacts: (out.artifacts ?? []).map((a) => a.kind).sort(),
    reads: names.filter((n) => !OBSERVABLE_TOOLS.has(n)).sort(),
  };
}

// Serializa a assinatura HARD de forma canônica (chave estável p/ set/diff). `reads`
// (tools internas) NÃO entra: só o que o cliente percebe trava o gate.
export function sigKey(s: StructuralSig): string {
  return JSON.stringify({ d: s.decision, s: s.status, act: s.actions, a: s.artifacts });
}

// Similaridade lexical (Jaccard sobre tokens) — sinal SOFT p/ drift de redação.
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function tokens(s: string): Set<string> {
  return new Set(norm(s).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2));
}
export function textSimilarity(a: string, b: string): number {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.size && !tb.size) return 1;
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / (ta.size + tb.size - inter);
}

async function runCase(clientId: string, c: EvalCase): Promise<RunOutput> {
  const transcript: ChatMessage[] = (c.historico ?? []).map((t) => ({ role: t.role, content: t.content }));
  return runAgent(
    { clientId, connectionId: "golden", contact: { id: `golden-${c.id}`, name: "Lead (golden)", waId: "0000000000" }, inboundText: c.mensagem },
    { mode: "test", transcript },
  );
}

// CAPTURA: roda cada caso `runs` vezes e registra o conjunto de assinaturas estruturais
// + amostras de texto. É o "estado aprovado" contra o qual as fases futuras são medidas.
export async function captureBaseline(opts: { clientId: string; runs: number; casesDir?: string }): Promise<GoldenBaseline> {
  const cases = loadCases(opts.casesDir);
  const casos: CaseBaseline[] = [];
  for (const c of cases) {
    const sigs = new Set<string>();
    const samples: CaseBaseline["samples"] = [];
    for (let i = 0; i < opts.runs; i++) {
      const out = await runCase(opts.clientId, c);
      const sig = structuralSig(out);
      const key = sigKey(sig);
      if (!sigs.has(key)) {
        sigs.add(key);
        samples.push({ sig: key, reply: out.reply ?? "", toolArgs: (out.toolCalls ?? []).map((t) => ({ name: t.name, args: t.args })) });
      }
    }
    casos.push({ id: c.id, descricao: c.descricao, signatures: [...sigs], samples, runs: opts.runs });
  }
  return {
    clientId: opts.clientId, createdAt: new Date().toISOString(), runs: opts.runs,
    temperature: process.env.AI_CHAT_TEMPERATURE ?? "(default)", casesDir: opts.casesDir ?? "evals/cases", casos,
  };
}

export type DriftKind = "STRUCTURAL" | "TEXT" | "MISSING_CASE" | "NONE";

export interface CaseDiff {
  id: string;
  descricao: string;
  drift: DriftKind;
  detalhe: string;
  observed: string[];        // assinaturas vistas agora
  baseline: string[];        // assinaturas do baseline
  minTextSim?: number;       // pior similaridade de texto contra as amostras do baseline
}

export interface GoldenCheckReport {
  clientId: string;
  runs: number;
  textThreshold: number;
  total: number;
  structuralDrift: number;   // casos com mudança ESTRUTURAL — HARD FAIL
  textDrift: number;         // casos só com drift de texto — revisão humana (soft)
  ok: number;
  casos: CaseDiff[];
}

// CHECK: reroda os casos e compara com o baseline. HARD FAIL se aparecer uma assinatura
// estrutural NUNCA vista no baseline (comportamento mudou). Drift só de texto é SOFT
// (reportado p/ revisão, não bloqueia — redação varia por design).
export async function checkAgainstBaseline(opts: {
  clientId: string; runs: number; baseline: GoldenBaseline; textThreshold?: number; casesDir?: string;
}): Promise<GoldenCheckReport> {
  const textThreshold = opts.textThreshold ?? 0.35;
  const cases = loadCases(opts.casesDir);
  const byId = new Map(opts.baseline.casos.map((b) => [b.id, b]));
  const casos: CaseDiff[] = [];

  for (const c of cases) {
    const base = byId.get(c.id);
    if (!base) {
      casos.push({ id: c.id, descricao: c.descricao, drift: "MISSING_CASE", detalhe: "caso não existe no baseline — recapture", observed: [], baseline: [] });
      continue;
    }
    const baseSet = new Set(base.signatures);
    const observed = new Set<string>();
    const replies: { key: string; reply: string }[] = [];
    for (let i = 0; i < opts.runs; i++) {
      const out = await runCase(opts.clientId, c);
      const key = sigKey(structuralSig(out));
      observed.add(key);
      replies.push({ key, reply: out.reply ?? "" });
    }

    // HARD: alguma assinatura observada fora do conjunto aprovado?
    const novas = [...observed].filter((k) => !baseSet.has(k));
    if (novas.length) {
      casos.push({
        id: c.id, descricao: c.descricao, drift: "STRUCTURAL",
        detalhe: `assinatura(s) estrutural(is) nova(s): ${novas.length} (decisão/tools/artefatos mudaram)`,
        observed: [...observed], baseline: base.signatures,
      });
      continue;
    }

    // SOFT: texto muito diferente da amostra de mesma assinatura?
    let minSim = 1;
    for (const r of replies) {
      const sample = base.samples.find((s) => s.sig === r.key);
      if (sample) minSim = Math.min(minSim, textSimilarity(sample.reply, r.reply));
    }
    if (minSim < textThreshold) {
      casos.push({
        id: c.id, descricao: c.descricao, drift: "TEXT",
        detalhe: `estrutura idêntica, mas redação divergiu (sim ${minSim.toFixed(2)} < ${textThreshold}) — revisar`,
        observed: [...observed], baseline: base.signatures, minTextSim: minSim,
      });
      continue;
    }

    casos.push({ id: c.id, descricao: c.descricao, drift: "NONE", detalhe: "comportamento preservado", observed: [...observed], baseline: base.signatures, minTextSim: minSim });
  }

  const structuralDrift = casos.filter((c) => c.drift === "STRUCTURAL" || c.drift === "MISSING_CASE").length;
  const textDrift = casos.filter((c) => c.drift === "TEXT").length;
  return {
    clientId: opts.clientId, runs: opts.runs, textThreshold,
    total: casos.length, structuralDrift, textDrift, ok: casos.filter((c) => c.drift === "NONE").length, casos,
  };
}
