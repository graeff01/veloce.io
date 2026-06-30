import { prismaUnscoped } from "@/lib/prisma";
import { sendWhatsAppText } from "@/lib/whatsapp-send";
import { isWithinBusinessHours } from "./gatekeeper";
import { nowParts } from "@/lib/tz";
import { logWaEvent } from "@/lib/wa-events";
import type { Window } from "@/lib/visit-availability";

// ── Re-engajamento dentro da janela ─────────────────────────────────────────────
// Recupera lead que ENGAJOU e ficou em silêncio: a IA manda UMA cutucada calorosa,
// ainda DENTRO da janela de 24h (free-form, sem template — compliant). Trava forte:
// 1 cutucada por silêncio, só fora do horário comercial (papel da IA), só se o lead
// engajou (tem perfil), respeitando opt-out/silenciar/takeover humano. Determinístico
// (sem LLM → custo zero e texto sempre profissional).

const NUDGE_AFTER_MIN = 40;        // silêncio após a IA responder
const WINDOW_GUARD_H = 23;         // só dentro da janela de 24h (com folga)
const MAX_PER_SWEEP = 20;          // teto por varredura

function nudgeText(vehicle: string | null): string {
  const sobre = vehicle ? `sobre o ${vehicle}` : "sobre o veículo";
  return `Oi! Ficou alguma dúvida ${sobre}? Posso te adiantar mais detalhes agora, ou já deixo tudo anotado para um vendedor falar com você. 😊`;
}

export async function reengageStalled(): Promise<{ nudged: number }> {
  const cfgs = await prismaUnscoped.aiAgentConfig.findMany({
    where: { enabled: true, paused: false, status: "live" },
    select: { clientId: true, businessHours: true, timezone: true },
  });
  const now = Date.now();
  let nudged = 0;
  for (const cfg of cfgs) {
    const hours = (cfg.businessHours as unknown as Window[]) ?? [];
    if (!hours.length) continue;
    const { weekday, minutes } = nowParts(cfg.timezone || "America/Sao_Paulo");
    if (isWithinBusinessHours(hours, weekday, minutes)) continue; // só fora do horário (papel da IA)

    const connIds = (await prismaUnscoped.waConnection.findMany({ where: { clientId: cfg.clientId }, select: { id: true } })).map((c) => c.id);
    if (!connIds.length) continue;

    const candidates = await prismaUnscoped.waConversation.findMany({
      where: {
        connectionId: { in: connIds },
        lastInboundAt: { gte: new Date(now - WINDOW_GUARD_H * 3600_000) },       // janela ainda aberta
        lastOutboundAt: { lte: new Date(now - NUDGE_AFTER_MIN * 60_000) },        // silêncio mínimo
      },
      select: { contactId: true, connectionId: true, lastInboundAt: true, lastOutboundAt: true, reengagedAt: true },
      take: 200,
    });

    let count = 0;
    for (const c of candidates) {
      if (count >= MAX_PER_SWEEP) break;
      if (!c.lastInboundAt || !c.lastOutboundAt) continue;
      if (c.lastOutboundAt <= c.lastInboundAt) continue;                          // lead falou por último → não cutuca
      if (c.reengagedAt && c.reengagedAt >= c.lastInboundAt) continue;            // já cutucou neste silêncio

      const [profile, contact, lastMsg] = await Promise.all([
        prismaUnscoped.leadProfile.findUnique({ where: { contactId: c.contactId }, select: { productInterest: true } }),
        prismaUnscoped.waContact.findUnique({ where: { id: c.contactId }, select: { waId: true, aiOptedOut: true, aiSilenced: true } }),
        prismaUnscoped.waMessage.findFirst({ where: { contactId: c.contactId }, orderBy: { timestamp: "desc" }, select: { direction: true, aiGenerated: true } }),
      ]);
      if (!profile) continue;                                                     // não engajou → não cutuca
      if (!contact || contact.aiOptedOut || contact.aiSilenced) continue;        // opt-out / silenciado
      if (!lastMsg || lastMsg.direction !== "out" || !lastMsg.aiGenerated) continue; // humano assumiu → não cutuca

      const conn = await prismaUnscoped.waConnection.findUnique({ where: { id: c.connectionId }, select: { id: true, phoneNumberId: true, accessToken: true } });
      if (!conn) continue;
      const lead = await prismaUnscoped.waLead.findUnique({ where: { contactId: c.contactId }, select: { adModel: true, adTitle: true } });
      const vehicle = lead?.adModel || lead?.adTitle || profile.productInterest || null;

      const text = nudgeText(vehicle);
      const sent = await sendWhatsAppText(conn, contact.waId, text);
      if (!sent.ok) continue;
      await prismaUnscoped.waMessage.create({ data: {
        connectionId: conn.id, contactId: c.contactId, waMessageId: sent.waMessageId || `ia-nudge-${Date.now()}`,
        direction: "out", type: "text", text, aiGenerated: true, timestamp: new Date(),
      } }).catch(() => {});
      await prismaUnscoped.waConversation.update({ where: { contactId: c.contactId }, data: { reengagedAt: new Date(), lastOutboundAt: new Date() } }).catch(() => {});
      await logWaEvent(conn.id, "ai.reengaged", c.contactId, { vehicle }).catch(() => {});
      count++; nudged++;
    }
  }
  return { nudged };
}
