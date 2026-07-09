/**
 * Loop de auto-melhoria (F3): colhe interações REAIS que merecem virar caso de teste
 * (bloqueadas, com erro, abstidas ou de baixa qualidade) e escreve CANDIDATOS a golden
 * em evals/candidates/ para curadoria humana. O humano revisa e promove para evals/cases/.
 *
 * Uso:
 *   AI_EVAL_CLIENT_ID=<clientId> npx tsx scripts/harvest-goldens.ts [--days 14] [--limit 40]
 *
 * Requer DATABASE_URL. Não altera nada em produção — só exporta arquivos.
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const clientId = arg("client") ?? process.env.AI_EVAL_CLIENT_ID;
  if (!clientId) { console.error("Falta o cliente. Use --client <id> ou AI_EVAL_CLIENT_ID."); process.exit(2); }
  const days = Number(arg("days") ?? 14);
  const limit = Number(arg("limit") ?? 40);
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);

  const rows = await prisma.aiInteraction.findMany({
    where: {
      clientId, createdAt: { gte: since }, inbound: { not: null },
      OR: [
        { status: { in: ["blocked", "error"] } },
        { decision: { in: ["abster", "sem_fonte", "bloqueado"] } },
        { qualityScore: { lt: 0.6 } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, inbound: true, outbound: true, decision: true, status: true, qualityScore: true },
  });

  const candidates = rows.map((r) => ({
    id: `harvest-${r.id.slice(0, 8)}`,
    descricao: `[REVISAR] ${r.status}/${r.decision ?? "—"}${r.qualityScore != null ? ` q=${r.qualityScore}` : ""}`,
    mensagem: r.inbound,
    _respostaObservada: r.outbound, // referência para o curador (não é asserção)
    espera: { rubrica: "AJUSTAR: descreva o comportamento correto esperado para este caso." },
  }));

  const dir = join(process.cwd(), "evals", "candidates");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `harvest-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(file, JSON.stringify(candidates, null, 2));

  console.log(`\n${candidates.length} candidato(s) exportado(s) para ${file}`);
  console.log("Revise, ajuste a rubrica/asserções e mova os bons para evals/cases/.\n");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
