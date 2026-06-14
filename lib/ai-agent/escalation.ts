import { prisma } from "@/lib/prisma";
import { recipientsFor, claimDispatch } from "@/lib/notifications/dispatch";

// Garante que NADA cai no vácuo: quando a IA escala para um humano ou quando ela não
// consegue responder, criamos uma Task no board do cliente E avisamos o operador.
// Idempotente: no máximo 1 task aberta por contato/tipo por dia (não floda o board).

type Kind = "handoff" | "failure" | "hot";

const KIND_META: Record<Kind, { type: string; emoji: string; label: string; priority: "HIGH" | "NORMAL" }> = {
  handoff: { type: "ia_handoff", emoji: "🙋", label: "IA encaminhou um lead", priority: "NORMAL" },
  failure: { type: "ia_falha", emoji: "⚠️", label: "IA não conseguiu responder um lead", priority: "HIGH" },
  hot: { type: "ia_lead_quente", emoji: "🔥", label: "Lead QUENTE — priorize o contato", priority: "HIGH" },
};

export async function createEscalationTask(input: {
  clientId: string;
  contactId: string;
  contactName: string | null;
  waId: string;
  reason: string;
  kind: Kind;
}): Promise<void> {
  const meta = KIND_META[input.kind];
  const who = input.contactName?.trim() || input.waId;
  const marker = `[ia:${input.contactId}]`;

  // Dedup: já existe task aberta para este contato/tipo nas últimas 24h?
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const dup = await prisma.task.findFirst({
    where: {
      clientId: input.clientId, type: meta.type, deletedAt: null,
      status: { not: "DONE" }, createdAt: { gte: since },
      description: { contains: marker },
    },
    select: { id: true },
  });
  if (dup) return;

  await prisma.task.create({
    data: {
      clientId: input.clientId,
      title: `${meta.emoji} ${meta.label}: ${who}`,
      description: `${input.reason}\n\nLead: ${who} (${input.waId})\n${marker}`,
      type: meta.type,
      status: "TODO",
      priority: meta.priority,
      dueDate: new Date(),
    },
  }).catch(() => {});

  // Aviso proativo ao operador (best-effort; não bloqueia o fluxo do lead).
  try {
    const client = await prisma.client.findUnique({ where: { id: input.clientId }, select: { name: true } });
    const recipients = await recipientsFor("criticalAlerts");
    const title = `${meta.emoji} ${client?.name ?? "Cliente"}`;
    const body = `${meta.label}: ${who}`;
    const tgText = `<b>${meta.emoji} ${client?.name ?? "Cliente"}</b>\n${meta.label}: ${who}\n${input.reason}`;
    const dedupe = `ia_esc:${input.contactId}:${input.kind}:${new Date().toISOString().slice(0, 10)}`;
    for (const r of recipients) {
      await claimDispatch(`${dedupe}:${r.userId}`, r.userId, "ia_escalation", { title, body, url: "/clients" }, tgText, r);
    }
  } catch { /* notificação é best-effort */ }
}
