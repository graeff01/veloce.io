/**
 * O que a IA fez, corrigiu e deixou de fazer — lido do que ela já registra.
 *
 * POR QUE ISTO EXISTE. Cada turno grava em `AiInteraction.guardrails` tudo que as
 * camadas de proteção acionaram: frase de clichê cortada, pedido de licença que
 * virou envio, capacidade errada barrada, aviso obrigatório acrescentado,
 * abstenção por preço sem fonte. Nada disso era olhado. O resultado prático é que
 * um falso positivo meu — uma frase boa cortada por engano — só apareceria como
 * reclamação de cliente, semanas depois, sem ninguém ligar uma coisa à outra.
 *
 * Este relatório é a resposta curta para "a IA está melhor ou pior esta semana?".
 *
 * COMO LER
 *  · as marcas `naturalidade:*` e `roteador:*` são a camada AGINDO. Subir não é
 *    ruim: significa que o modelo continua tentando e está sendo corrigido.
 *  · `grounding:*` e `verify:*` são ABSTENÇÃO — a IA preferiu calar a arriscar um
 *    dado. Um pico aqui merece olhar: pode ser acervo faltando, não modelo ruim.
 *  · `status=error` é falha de infra (rate limit, timeout), não comportamento.
 *  · TAXA importa mais que contagem: 40 clichês em 2.000 turnos é 2%; em 200 é 20%.
 *
 * Uso:
 *   railway run --service Postgres bash -c 'export DATABASE_URL="$DATABASE_PUBLIC_URL";
 *     npx tsx scripts/ia-relatorio.ts [--dias 7] [--cliente jr]'
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL ausente"); process.exit(1); }
const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) });

const arg = (n: string, d?: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const pct = (n: number, total: number) => total ? `${((100 * n) / total).toFixed(1)}%` : "—";

// Como agrupar as marcas. A ordem é a da leitura: primeiro o que a camada
// corrigiu, depois o que ela barrou, por último o que falhou.
const GRUPOS: { titulo: string; nota: string; prefixos: string[]; exceto?: string[] }[] = [
  {
    // O roteador tem QUATRO sentidos e três aparecem aqui; `garantiu` é ação, não
    // texto, e vai no grupo seguinte. Sem o `exceto`, a marca de IMPOSIÇÃO
    // (`roteador:<id da regra>`) caía no catch-all de "não agrupadas".
    titulo: "CORRIGIDO no texto (a camada agindo)",
    nota: "subir não é ruim — o modelo tentou e foi corrigido antes de chegar ao lead",
    prefixos: ["naturalidade:", "roteador:", "autoridade:", "sanitize:"],
    exceto: ["roteador:garantiu", "naturalidade:executou"],
  },
  {
    titulo: "AÇÃO garantida (a ferramenta que faltou)",
    nota: "a IA ofereceu em vez de fazer, e o envio aconteceu de todo jeito",
    prefixos: ["roteador:garantiu", "naturalidade:executou"],
  },
  {
    titulo: "ABSTENÇÃO (preferiu calar a arriscar)",
    nota: "pico aqui costuma ser ACERVO faltando, não modelo ruim — vale ler os casos",
    prefixos: ["grounding:", "verify:", "egress:", "security:"],
  },
];

async function main() {
  const dias = Number(arg("dias", "7"));
  const nomeCliente = arg("cliente");
  const desde = new Date(Date.now() - dias * 24 * 3600 * 1000);

  let clientId: string | undefined;
  let nome = "todos os clientes";
  if (nomeCliente) {
    const c = await prisma.client.findFirst({ where: { name: { contains: nomeCliente, mode: "insensitive" } }, select: { id: true, name: true } });
    if (!c) { console.error(`cliente "${nomeCliente}" não encontrado`); process.exit(1); }
    clientId = c.id; nome = c.name;
  }

  const turnos = await prisma.aiInteraction.findMany({
    where: { createdAt: { gte: desde }, ...(clientId ? { clientId } : {}) },
    select: { guardrails: true, decision: true, status: true, qualityScore: true },
  });

  const total = turnos.length;
  console.log(`\n═══ ${nome} · últimos ${dias} dia(s) · ${total} turno(s) ═══`);
  if (!total) { console.log("\nNenhum turno no período.\n"); return; }

  // Contagem por marca.
  const marcas = new Map<string, number>();
  for (const t of turnos) {
    for (const g of ((t.guardrails as string[] | null) ?? [])) {
      // As marcas carregam detalhe depois do 2º ":" (ex.: o texto removido).
      // Agrupa pelo prefixo estável, senão cada caso vira uma linha só dele.
      const chave = g.split(":").slice(0, 2).join(":");
      marcas.set(chave, (marcas.get(chave) ?? 0) + 1);
    }
  }

  for (const grupo of GRUPOS) {
    const linhas = [...marcas.entries()]
      .filter(([m]) => grupo.prefixos.some((p) => m.startsWith(p)) && !(grupo.exceto ?? []).some((p) => m.startsWith(p)))
      .sort((a, b) => b[1] - a[1]);
    if (!linhas.length) continue;
    console.log(`\n── ${grupo.titulo} ──`);
    console.log(`   (${grupo.nota})`);
    for (const [m, n] of linhas) console.log(`   ${String(n).padStart(5)}  ${pct(n, total).padStart(6)}  ${m}`);
  }

  // O que sobrou: marca nova que ninguém previu aqui. Melhor aparecer do que
  // ficar invisível por não estar na lista de grupos.
  const cobertas = new Set(GRUPOS.flatMap((g) => [...marcas.keys()].filter((m) =>
    g.prefixos.some((p) => m.startsWith(p)) && !(g.exceto ?? []).some((p) => m.startsWith(p)))));
  const orfas = [...marcas.entries()].filter(([m]) => !cobertas.has(m)).sort((a, b) => b[1] - a[1]);
  if (orfas.length) {
    console.log(`\n── OUTRAS marcas (não agrupadas — marca nova?) ──`);
    for (const [m, n] of orfas) console.log(`   ${String(n).padStart(5)}  ${pct(n, total).padStart(6)}  ${m}`);
  }

  // Decisão e saúde.
  const porDecisao = new Map<string, number>();
  for (const t of turnos) porDecisao.set(t.decision ?? "—", (porDecisao.get(t.decision ?? "—") ?? 0) + 1);
  console.log(`\n── DECISÃO do turno ──`);
  for (const [d, n] of [...porDecisao.entries()].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(5)}  ${pct(n, total).padStart(6)}  ${d}`);

  const erros = turnos.filter((t) => t.status === "error").length;
  const bloqueados = turnos.filter((t) => t.status === "blocked").length;
  const notas = turnos.map((t) => t.qualityScore).filter((x): x is number => typeof x === "number");
  console.log(`\n── SAÚDE ──`);
  console.log(`   erro de infra (rate limit/timeout): ${erros} (${pct(erros, total)})`);
  console.log(`   bloqueado por guardrail:            ${bloqueados} (${pct(bloqueados, total)})`);
  console.log(`   nota do juiz (quando houver):       ${notas.length ? (notas.reduce((a, b) => a + b, 0) / notas.length).toFixed(2) : "—"} em ${notas.length} avaliad(os)`);

  // O sinal que mais importa: silêncio e abstenção não podem virar rotina.
  const abstencoes = turnos.filter((t) => t.decision === "abster").length;
  const silencios = turnos.filter((t) => ((t.guardrails as string[] | null) ?? []).includes("naturalidade:silenciou")).length;
  console.log(`\n── ATENÇÃO ──`);
  console.log(`   abstenções ("prefiro confirmar com um vendedor"): ${abstencoes} (${pct(abstencoes, total)})`);
  console.log(`   turnos em SILÊNCIO deliberado:                    ${silencios} (${pct(silencios, total)})`);
  if (total >= 50 && abstencoes / total > 0.1) console.log(`   ⚠️  mais de 10% de abstenção — provável ACERVO faltando, vale ler os casos`);
  console.log();
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
