// Reseta o histórico dos NÚMEROS DE TESTE da JR (para testar do zero).
// Casa os contatos por número tolerando o 9º dígito (brKey). Apaga TUDO do contato
// (mensagens, conversa, funil, memória, ficha, orçamentos, jobs, análises) e o próprio
// contato — no próximo "oi" ele volta como lead 100% novo.
// Escopo ESTRITO: só contatos cujo número casa com testNumbers. Leads reais não são tocados.
// DRY-RUN por padrão (só conta); use --apply para apagar.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { brKey } from "../lib/phone-br";

const APPLY = process.argv.includes("--apply");
// client BASE (sem o tenant-guard) — deletes escopados por contactId.
const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })) });

// Modelos com contactId a limpar (ordem: filhos primeiro, contato por último).
const CHILD_MODELS = [
  "waContactTag", "waMessage", "waLead", "waConversation", "funnelCheck",
  "visit", "aiJob", "quote", "leadProfile", "messageAnalysis", "leadObjection",
  "aiInteraction", "aiResponseEvaluation", "humanReview", "funnelShadow",
] as const;

async function main() {
  const jr = await prisma.client.findFirst({ where: { name: { contains: "JR", mode: "insensitive" } }, select: { id: true, name: true } });
  if (!jr) throw new Error("JR não encontrada");
  const conn = await prisma.waConnection.findFirst({ where: { clientId: jr.id }, select: { id: true } });
  if (!conn) throw new Error("Conexão da JR não encontrada");
  const cfg = await prisma.aiAgentConfig.findUnique({ where: { clientId: jr.id }, select: { testNumbers: true } });
  const testKeys = new Set(((cfg!.testNumbers as string[]) ?? []).map(brKey));
  console.log(`Cliente: ${jr.name} | testNumbers (${testKeys.size}):`, [...testKeys]);
  console.log(APPLY ? "\n*** APPLY — vai APAGAR ***\n" : "\n--- DRY-RUN (só conta; use --apply) ---\n");

  // Acha os contatos-teste (por brKey) — SÓ na conexão da JR.
  const all = await prisma.waContact.findMany({ where: { connectionId: conn.id }, select: { id: true, waId: true, name: true } });
  const targets = all.filter((c) => testKeys.has(brKey(c.waId)));
  console.log(`Contatos-teste encontrados: ${targets.length}`);
  if (!targets.length) { console.log("Nada a fazer."); return; }

  for (const c of targets) {
    console.log(`\n🧪 ${c.waId} "${c.name ?? ''}" (${c.id})`);
    const ids = { contactId: c.id };
    for (const model of CHILD_MODELS) {
      const m = (prisma as any)[model];
      try {
        if (APPLY) {
          const r = await m.deleteMany({ where: ids });
          if (r.count) console.log(`   - ${model}: apagados ${r.count}`);
        } else {
          const n = await m.count({ where: ids });
          if (n) console.log(`   - ${model}: ${n}`);
        }
      } catch (e) {
        console.log(`   - ${model}: (pulado: ${(e as Error).message.split("\n")[0]})`);
      }
    }
    if (APPLY) {
      await prisma.waContact.delete({ where: { id: c.id } });
      console.log(`   ✓ contato apagado`);
    }
  }
  console.log("\nPronto.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
