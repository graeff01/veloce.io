/**
 * Fase 0 do RFC de escala (docs/arquitetura-custo-escala.md · docs/runtime-veloce.md).
 * Relatório de decomposição de custo — 100% READ-ONLY. Não altera nada, não chama modelo.
 * Estabelece o BASELINE real antes de qualquer otimização. Fonte: AiUsage (uma linha por
 * chamada ao modelo) + AiInteraction (um registro por turno do agente).
 *
 * O que mede (Princípio 8):
 *   • custo por lead real (por cliente e agregado)
 *   • CHAMADAS AO MODELO por lead, quebradas por pipeline (a variável de escala #1)
 *   • hit-rate do prompt cache no chat (cachedTokens / tokensIn)
 *   • tokens médios de entrada/saída por chamada de chat
 *   • distribuição de execuções de tool por turno (proxy dos round-trips do loop)
 *   • histograma de TIPO DE TURNO (trivial-ack vs conteúdo) → % endereçável por fast-path
 *   • desperdício de contexto de orçamento: turnos de clientes com quotesEnabled que NÃO
 *     tocaram nenhuma tool de orçamento (pagaram a "taxa" do quoteGuidance à toa)
 *
 * Uso:
 *   npx tsx scripts/cost-report.ts [--days 30] [--client <id>]
 * Requer DATABASE_URL. Sem --client, agrega todos os clientes e mostra o top por custo.
 */
import "dotenv/config";
import { prismaUnscoped } from "@/lib/prisma";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const QUOTE_TOOLS = new Set(["gerar_orcamento", "enviar_orcamento", "aprovar_orcamento", "atualizar_ficha", "pedir_localizacao"]);

// Mesma heurística de trivialidade usada no gate de análise (intelligence.isAnalyzable),
// replicada aqui para NÃO importar o pipeline. Turno trivial = candidato a fast-path.
function isTrivialTurn(text: string | null | undefined): boolean {
  if (!text) return true;
  const t = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  if (t.replace(/[^a-z0-9]/g, "").length < 3) return true;
  return /^(ok+|okay|blz|beleza|entendi+|entendido|kk+|ks+|rs+|haha+|valeu|vlw|obrigad[oa]|brigad[oa]|sim|nao|certo|isso|isso ai|uhum|aham|tendi|show|otim[oa]|perfeito|combinado|fechado|ta bom|tabom|bom dia|boa tarde|boa noite|oi+|ola+|opa)[\s!.]*$/.test(t);
}

const money = (n: number) => `$${n.toFixed(4)}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

interface ClientAgg {
  clientId: string;
  name: string | null;
  costTotal: number;
  costByPipeline: Map<string, number>;
  callsByPipeline: Map<string, number>;
  leads: Set<string>;
  chatTokensIn: number;
  chatCached: number;
  chatTokensOut: number;
  chatCalls: number;
  interactions: number;
  toolHist: Map<number, number>; // nº de tools no turno → contagem
  trivialTurns: number;
  quotesEnabled: boolean;
  quoteTaxTurns: number; // turnos (cliente c/ quotes) sem tocar tool de orçamento
}

function emptyAgg(clientId: string): ClientAgg {
  return {
    clientId, name: null, costTotal: 0, costByPipeline: new Map(), callsByPipeline: new Map(),
    leads: new Set(), chatTokensIn: 0, chatCached: 0, chatTokensOut: 0, chatCalls: 0,
    interactions: 0, toolHist: new Map(), trivialTurns: 0, quotesEnabled: false, quoteTaxTurns: 0,
  };
}

async function main() {
  const days = Number(arg("days") ?? 30);
  const only = arg("client");
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const whereClient = only ? { clientId: only } : {};

  // 1) Custo e chamadas por pipeline — AiUsage: 1 linha = 1 chamada ao modelo.
  const usage = await prismaUnscoped.aiUsage.findMany({
    where: { createdAt: { gte: since }, ...whereClient },
    select: { clientId: true, pipeline: true, tokensIn: true, cachedTokens: true, tokensOut: true, costUsd: true },
  });

  // 2) Interações (turnos do agente) — leads, tools por turno, tipo de turno.
  const interactions = await prismaUnscoped.aiInteraction.findMany({
    where: { createdAt: { gte: since }, ...whereClient },
    select: { clientId: true, contactId: true, inbound: true, toolCalls: true, decision: true, status: true },
  });

  // 3) Config: quais clientes têm orçamento ligado (para medir a "taxa" do quoteGuidance).
  const cfgs = await prismaUnscoped.aiAgentConfig.findMany({
    where: only ? { clientId: only } : {}, select: { clientId: true, quotesEnabled: true },
  });
  const quotesOn = new Map(cfgs.map((c) => [c.clientId, !!c.quotesEnabled]));

  const names = new Map(
    (await prismaUnscoped.client.findMany({ select: { id: true, name: true } })).map((c) => [c.id, c.name]),
  );

  const byClient = new Map<string, ClientAgg>();
  const get = (id: string) => {
    let a = byClient.get(id);
    if (!a) { a = emptyAgg(id); a.name = names.get(id) ?? null; a.quotesEnabled = quotesOn.get(id) ?? false; byClient.set(id, a); }
    return a;
  };

  for (const u of usage) {
    const a = get(u.clientId);
    a.costTotal += u.costUsd;
    a.costByPipeline.set(u.pipeline, (a.costByPipeline.get(u.pipeline) ?? 0) + u.costUsd);
    a.callsByPipeline.set(u.pipeline, (a.callsByPipeline.get(u.pipeline) ?? 0) + 1);
    if (u.pipeline === "chat") {
      a.chatTokensIn += u.tokensIn; a.chatCached += u.cachedTokens; a.chatTokensOut += u.tokensOut; a.chatCalls += 1;
    }
  }

  for (const it of interactions) {
    const a = get(it.clientId);
    a.interactions += 1;
    if (it.contactId) a.leads.add(it.contactId);
    const nTools = Array.isArray(it.toolCalls) ? it.toolCalls.length : 0;
    a.toolHist.set(nTools, (a.toolHist.get(nTools) ?? 0) + 1);
    if (isTrivialTurn(it.inbound)) a.trivialTurns += 1;
    if (a.quotesEnabled) {
      const toolNames = Array.isArray(it.toolCalls) ? (it.toolCalls as Array<{ name?: string }>).map((t) => t?.name) : [];
      if (!toolNames.some((n) => n && QUOTE_TOOLS.has(n))) a.quoteTaxTurns += 1;
    }
  }

  const clients = [...byClient.values()].sort((a, b) => b.costTotal - a.costTotal);
  const top = only ? clients : clients.slice(0, 15);

  // ── Saída ──────────────────────────────────────────────────────────────────
  const line = "─".repeat(78);
  console.log(`\nVELOCE IA — RELATÓRIO DE CUSTO (baseline)  ·  janela: ${days}d  ·  ${new Date().toISOString().slice(0, 10)}`);
  console.log(line);

  // Agregado global
  const tot = clients.reduce(
    (s, c) => {
      s.cost += c.costTotal; s.leads += c.leads.size; s.chatCalls += c.chatCalls;
      s.chatIn += c.chatTokensIn; s.chatCached += c.chatCached; s.chatOut += c.chatTokensOut;
      s.interactions += c.interactions; s.trivial += c.trivialTurns;
      for (const [p, cost] of c.costByPipeline) s.pipeCost.set(p, (s.pipeCost.get(p) ?? 0) + cost);
      for (const [p, n] of c.callsByPipeline) s.pipeCalls.set(p, (s.pipeCalls.get(p) ?? 0) + n);
      return s;
    },
    { cost: 0, leads: 0, chatCalls: 0, chatIn: 0, chatCached: 0, chatOut: 0, interactions: 0, trivial: 0, pipeCost: new Map<string, number>(), pipeCalls: new Map<string, number>() },
  );

  console.log(`\n■ AGREGADO (${only ? "cliente único" : `${clients.length} clientes`})`);
  console.log(`  Custo total .............. ${money(tot.cost)}`);
  console.log(`  Leads (contatos únicos) .. ${tot.leads}`);
  console.log(`  Custo / lead ............. ${tot.leads ? money(tot.cost / tot.leads) : "—"}`);
  console.log(`  Turnos do agente ......... ${tot.interactions}`);
  console.log(`  Chamadas ao modelo (total) ${[...tot.pipeCalls.values()].reduce((a, b) => a + b, 0)}`);
  console.log(`  Chamadas de chat / lead .. ${tot.leads ? (tot.chatCalls / tot.leads).toFixed(2) : "—"}   ← alavanca de escala #1`);
  console.log(`  Chamadas TOTAIS / lead ... ${tot.leads ? ([...tot.pipeCalls.values()].reduce((a, b) => a + b, 0) / tot.leads).toFixed(2) : "—"}`);
  console.log(`  Prompt cache hit-rate .... ${tot.chatIn ? pct(tot.chatCached / tot.chatIn) : "—"}  (chat)`);
  console.log(`  Tokens in / chamada chat . ${tot.chatCalls ? Math.round(tot.chatIn / tot.chatCalls) : "—"}`);
  console.log(`  Tokens out / chamada chat  ${tot.chatCalls ? Math.round(tot.chatOut / tot.chatCalls) : "—"}`);
  console.log(`  Turnos triviais (fast-path endereçável) ${tot.interactions ? pct(tot.trivial / tot.interactions) : "—"}`);

  console.log(`\n  Custo e chamadas por pipeline:`);
  const pipes = [...tot.pipeCost.keys()].sort((a, b) => (tot.pipeCost.get(b)! - tot.pipeCost.get(a)!));
  for (const p of pipes) {
    console.log(`    ${p.padEnd(13)} ${money(tot.pipeCost.get(p) ?? 0).padStart(10)}  ·  ${String(tot.pipeCalls.get(p) ?? 0).padStart(7)} chamadas  (${pct((tot.pipeCost.get(p) ?? 0) / (tot.cost || 1))})`);
  }

  // Por cliente
  console.log(`\n${line}\n■ POR CLIENTE (top por custo)\n`);
  for (const c of top) {
    const leads = c.leads.size;
    const hit = c.chatTokensIn ? c.chatCached / c.chatTokensIn : 0;
    const toolDist = [...c.toolHist.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(" ");
    console.log(`● ${c.name ?? c.clientId}  (${c.clientId})`);
    console.log(`    custo ${money(c.costTotal)} · leads ${leads} · custo/lead ${leads ? money(c.costTotal / leads) : "—"}`);
    console.log(`    chat calls/lead ${leads ? (c.chatCalls / leads).toFixed(2) : "—"} · cache hit ${pct(hit)} · tok in/call ${c.chatCalls ? Math.round(c.chatTokensIn / c.chatCalls) : "—"}`);
    console.log(`    turnos ${c.interactions} · triviais ${c.interactions ? pct(c.trivialTurns / c.interactions) : "—"} · tools/turno [${toolDist}]`);
    if (c.quotesEnabled) console.log(`    quotesEnabled: SIM · turnos sem tool de orçamento (taxa quoteGuidance) ${c.interactions ? pct(c.quoteTaxTurns / c.interactions) : "—"}`);
    console.log("");
  }

  console.log(line);
  console.log("Baseline registrado. Use estes números para calibrar as metas das Fases 1→6.");
  console.log("Nada foi alterado (script read-only).\n");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
