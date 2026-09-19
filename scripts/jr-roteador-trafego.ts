/**
 * Mede a regra do roteador contra tráfego REAL antes de ligar.
 * O risco é o falso positivo: disparar a pergunta em quem não precisa dela
 * atrapalha um atendimento que estava indo bem.
 */
import "dotenv/config";
import { prismaUnscoped as db } from "@/lib/prisma";
import { lerRegras, decidir } from "@/lib/ai-agent/roteador";
import { REGRAS_JR } from "./jr-roteador-regras";

async function main() {
  const regras = lerRegras({ roteador: REGRAS_JR });
  console.log(`regras: ${regras.map((r) => r.id).join(", ")}\n`);

  const conns = (await db.waConnection.findMany({ select: { id: true } })).map((c) => c.id);
  const msgs = await db.waMessage.findMany({
    where: { contact: { connectionId: { in: conns } }, direction: "in", text: { not: null } },
    select: { text: true }, take: 60000,
  });

  const disparou = msgs.filter((m) => decidir(regras, m.text, [], "X"));
  console.log(`=== ${msgs.length} mensagens reais de lead ===`);
  console.log(`  dispara a pergunta: ${disparou.length} (${((disparou.length / msgs.length) * 100).toFixed(2)}%)\n`);
  for (const m of disparou.slice(0, 25)) console.log(`   ✓ "${String(m.text).replace(/\n/g, " ").slice(0, 112)}"`);

  // O outro lado: quem fala em fogão e NÃO dispara (porque já especificou).
  const sa = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const falamFogao = msgs.filter((m) => { const t = sa(String(m.text)); return /\bfogao|campeir/.test(t) && /churrasqueir|prime|gourmet|tradicao|parrilla/.test(t); });
  const naoDispara = falamFogao.filter((m) => !decidir(regras, m.text, [], "X"));
  console.log(`\n=== dos ${falamFogao.length} que pedem churrasqueira COM fogão ===`);
  console.log(`  ${disparou.length} recebem a pergunta · ${naoDispara.length} não (já especificaram)\n`);
  for (const m of naoDispara.slice(0, 15)) console.log(`   · "${String(m.text).replace(/\n/g, " ").slice(0, 110)}"`);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
