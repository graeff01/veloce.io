/**
 * MEDE as travas de preço contra as respostas REAIS da IA, antes de religar.
 *
 * POR QUE. Trava que barra resposta certa cala o atendimento — e isso já se
 * mostrou pior que o erro que ela vinha resolver (a 1ª versão da trava de
 * capacidade acusou 10 de 123 respostas reais, todas corretas). Então, antes de
 * ir para o cliente, cada trava passa pelas conversas que já aconteceram.
 *
 * O QUE MOSTRA, para cada resposta da IA desde --desde:
 *   · preco_do_produto — preço real do produto ERRADO. Conferido contra a
 *     tabela QUE VALIA NA ÉPOCA: se a tabela de nov/2026 já foi aplicada, os
 *     valores são revertidos para os velhos (as conversas do fim de semana
 *     falavam R$ 1.447 da Prime 9, e isso estava CERTO naquele dia).
 *   · preco_sem_fonte — o que o grounding já registrava em monitor. Com o rigor
 *     ligado (jr-rigor-preco.ts), essas respostas passam a ser BARRADAS.
 *
 * Leia cada caso: acusação certa = erro que a trava pega; acusação errada =
 * resposta boa que seria calada. Me mande a saída.
 *
 * Só LÊ. Não precisa de crédito na OpenAI.
 *   railway run --service Postgres bash -c 'export DATABASE_URL="$DATABASE_PUBLIC_URL";
 *     npx tsx scripts/jr-trava-preco-medir.ts [--desde 2026-10-31]'
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { lerTabelaPrecos, precosErradosDoProduto } from "../lib/ai-agent/preco-produto";
import { T } from "./jr-tabela-nov2026-dados";

const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL ausente"); process.exit(1); }
const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const desde = new Date(`${arg("desde", "2026-10-31")}T00:00:00-03:00`);

(async () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) });
  const c = await prisma.client.findFirst({ where: { name: { contains: "jr", mode: "insensitive" } }, select: { id: true, name: true } });
  if (!c) { console.error("JR não encontrada"); process.exit(1); }
  const pc = await prisma.pricingConfig.findUnique({ where: { clientId: c.id }, select: { rules: true } });
  const rules = structuredClone((pc?.rules ?? {}) as Record<string, unknown>);

  // A tabela da ÉPOCA das conversas.
  const aplicada = rules.tabelaPrecos === "catalogo-2026-11";
  if (aplicada) {
    const volta = new Map(T.map((m) => [m.novo, m.velho]));
    for (const lista of ["base", "options"]) {
      for (const it of (Array.isArray(rules[lista]) ? rules[lista] : []) as { amount?: number }[]) {
        if (typeof it.amount === "number" && volta.has(it.amount)) it.amount = volta.get(it.amount);
      }
    }
  }
  const tabela = lerTabelaPrecos(rules);
  console.log(`\n══ ${c.name} · respostas desde ${desde.toLocaleDateString("pt-BR")} · tabela ${aplicada ? "VELHA (revertida da nova)" : "atual (ainda a velha)"} · ${tabela.length} produtos ══\n`);
  if (!tabela.length) { console.log("Sem tabela no orçamento — a trava de produto não tem o que conferir."); }

  const turnos = await prisma.aiInteraction.findMany({
    where: { clientId: c.id, createdAt: { gte: desde }, outbound: { not: null } },
    select: { createdAt: true, outbound: true, guardrails: true, contactId: true },
    orderBy: { createdAt: "asc" },
  });
  const comPreco = turnos.filter((t) => /r\$/i.test(t.outbound ?? ""));

  const produto: string[] = [];
  const semFonte: string[] = [];
  for (const t of turnos) {
    const quando = t.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const txt = (t.outbound ?? "").replace(/\s+/g, " ").slice(0, 260);
    for (const e of precosErradosDoProduto(t.outbound ?? "", tabela)) {
      produto.push(`${quando} · ${e.produto}: disse ${e.disse}, tabela ${e.esperado.join("/")}\n      "${txt}"`);
    }
    const g = Array.isArray(t.guardrails) ? (t.guardrails as string[]) : [];
    if (g.some((x) => x.includes("preco_sem_fonte"))) semFonte.push(`${quando}\n      "${txt}"`);
  }

  console.log(`respostas: ${turnos.length} · com preço: ${comPreco.length}\n`);
  console.log(`1) PREÇO DO PRODUTO ERRADO — seria barrado: ${produto.length}`);
  for (const p of produto) console.log(`   · ${p}`);
  console.log(`\n2) PREÇO SEM FONTE — com o rigor ligado, seria barrado: ${semFonte.length}`);
  for (const p of semFonte) console.log(`   · ${p}`);
  console.log(`\nTaxa de barragem nas respostas com preço: ${comPreco.length ? ((100 * (produto.length + semFonte.length)) / comPreco.length).toFixed(1) : "—"}%`);
  console.log("Leia os casos: cada acusação errada é uma resposta boa que viraria \"o vendedor te responde\".\n");
  await prisma.$disconnect();
})().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
