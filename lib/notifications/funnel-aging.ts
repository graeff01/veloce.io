import { prismaUnscoped } from "@/lib/prisma";
import { logWaEvent } from "@/lib/wa-events";

// ── Envelhecimento do funil (higiene do board) ─────────────────────────────────
// Lead sem QUALQUER atividade há N dias vira Perdido — automático (não-manual): se o
// lead voltar a falar, o classificador reavança normalmente. Limpa o board de leads
// mortos SEM zerar o mês: o pipeline vivo (ex.: negociação em curso) e o histórico
// (funil analítico é por data de entrada) ficam intactos. Rodado 1x/dia pelo scheduler.

const STALE_DAYS = Number(process.env.FUNNEL_STALE_DAYS || 30);
const AGEABLE = ["recebido", "respondido", "qualificado", "negociacao"]; // nunca toca terminais

export async function runFunnelAging(): Promise<{ aged: number }> {
  const cut = new Date(Date.now() - STALE_DAYS * 864e5);

  // Coleta os alvos (p/ log por lead) — só os não-manuais, não-terminais e parados.
  const stale = await prismaUnscoped.waConversation.findMany({
    where: {
      funnelManual: false,
      funnelStage: { in: AGEABLE },
      lastMessageAt: { lt: cut },
    },
    select: { contactId: true, connectionId: true, funnelStage: true },
  });
  if (stale.length === 0) return { aged: 0 };

  const evidence = `Sem atividade há ${STALE_DAYS}+ dias (parado)`;
  const res = await prismaUnscoped.waConversation.updateMany({
    where: { contactId: { in: stale.map((c) => c.contactId) }, funnelManual: false, funnelStage: { in: AGEABLE } },
    data: { funnelStage: "perdido", funnelEvidence: evidence },
  });

  // Auditoria por lead (best-effort; não bloqueia).
  await Promise.all(
    stale.map((c) => logWaEvent(c.connectionId, "funnel.aged", c.contactId, { from: c.funnelStage, to: "perdido", staleDays: STALE_DAYS }).catch(() => {})),
  );
  return { aged: res.count };
}
