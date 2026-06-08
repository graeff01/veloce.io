import { prisma } from "@/lib/prisma";
import type { ToolDef } from "@/lib/openai";
import { slotsForDate, isSlotAvailable, DEFAULT_WINDOWS, type VisitCfg } from "@/lib/visit-availability";

export interface ToolCtx {
  clientId: string;
  connectionId: string;
  contactId: string;
  contactName: string | null;
  contactWaId: string;
}

export const TOOL_DEFS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "buscar_estoque",
      description: "Busca produtos no catálogo do cliente (ex: carros). Use SEMPRE que o lead perguntar sobre produto/preço. Nunca invente.",
      parameters: { type: "object", properties: { termo: { type: "string", description: "modelo/termo procurado, ex: 'Taos' ou 'SUV até 120 mil'" } }, required: ["termo"] },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_disponibilidade",
      description: "Consulta os horários livres para visita numa data. Use antes de sugerir/marcar visita.",
      parameters: { type: "object", properties: { data: { type: "string", description: "data no formato AAAA-MM-DD" } }, required: ["data"] },
    },
  },
  {
    type: "function",
    function: {
      name: "marcar_visita",
      description: "Agenda uma visita do lead à loja num horário livre. Só use horários retornados por consultar_disponibilidade.",
      parameters: { type: "object", properties: {
        nome: { type: "string" }, data: { type: "string", description: "AAAA-MM-DD" }, hora: { type: "string", description: "HH:MM" },
        carro: { type: "string" }, telefone: { type: "string" },
      }, required: ["nome", "data", "hora"] },
    },
  },
  {
    type: "function",
    function: {
      name: "atualizar_perfil",
      description: "Registra o que descobriu do lead (qualificação). Chame quando o lead informar produto de interesse, orçamento, troca ou financiamento.",
      parameters: { type: "object", properties: {
        produto: { type: "string" }, orcamento: { type: "string" },
        tem_troca: { type: "boolean" }, quer_financiamento: { type: "boolean" },
      } },
    },
  },
  {
    type: "function",
    function: {
      name: "escalar_humano",
      description: "Encaminha para um vendedor humano quando o lead pedir algo que você não pode (desconto, financiamento, avaliação de troca) ou quando não houver fonte para responder.",
      parameters: { type: "object", properties: { motivo: { type: "string" } }, required: ["motivo"] },
    },
  },
];

async function getVisitCfg(clientId: string): Promise<VisitCfg> {
  const c = await prisma.visitConfig.findUnique({ where: { clientId } });
  if (!c) return { slotMinutes: 60, capacityPerSlot: 1, windows: DEFAULT_WINDOWS };
  return { slotMinutes: c.slotMinutes, capacityPerSlot: c.capacityPerSlot, windows: (c.windows as unknown as VisitCfg["windows"]) ?? DEFAULT_WINDOWS };
}

export interface ToolResult { result: string; decision?: string }

export async function executeTool(name: string, args: Record<string, unknown>, ctx: ToolCtx): Promise<ToolResult> {
  switch (name) {
    case "buscar_estoque": {
      const termo = String(args.termo ?? "").trim();
      const items = await prisma.catalogItem.findMany({
        where: { clientId: ctx.clientId, available: true, title: { contains: termo, mode: "insensitive" } },
        take: 6, orderBy: { price: "asc" },
      });
      if (items.length === 0) {
        const total = await prisma.catalogItem.count({ where: { clientId: ctx.clientId, available: true } });
        return { result: total === 0 ? "Catálogo ainda não cadastrado. Não invente produtos: ofereça encaminhar para um vendedor." : `Nenhum item encontrado para "${termo}".`, decision: "respondeu_duvida" };
      }
      const list = items.map((i) => `- ${i.title}${i.price ? ` — R$ ${i.price.toLocaleString("pt-BR")}` : ""}${i.attributes ? ` (${Object.entries(i.attributes as object).map(([k, v]) => `${k}: ${v}`).join(", ")})` : ""}`).join("\n");
      return { result: `Itens disponíveis (confirme a disponibilidade na visita):\n${list}`, decision: "respondeu_duvida" };
    }

    case "consultar_disponibilidade": {
      const dateStr = String(args.data ?? "");
      const date = new Date(`${dateStr}T12:00:00`);
      if (isNaN(date.getTime())) return { result: "Data inválida." };
      const cfg = await getVisitCfg(ctx.clientId);
      const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart); dayEnd.setDate(dayStart.getDate() + 1);
      const booked = await prisma.visit.findMany({ where: { clientId: ctx.clientId, scheduledAt: { gte: dayStart, lt: dayEnd } }, select: { scheduledAt: true } });
      const slots = slotsForDate(cfg, date, booked.map((b) => b.scheduledAt));
      return { result: slots.length ? `Horários livres em ${dateStr}: ${slots.join(", ")}` : `Sem horários livres em ${dateStr}. Ofereça outra data.` };
    }

    case "marcar_visita": {
      const dt = new Date(`${String(args.data)}T${String(args.hora)}:00`);
      if (isNaN(dt.getTime())) return { result: "Data/hora inválida." };
      const cfg = await getVisitCfg(ctx.clientId);
      const booked = await prisma.visit.findMany({ where: { clientId: ctx.clientId, scheduledAt: dt }, select: { id: true } });
      if (!isSlotAvailable(cfg, dt, booked.length)) return { result: "Esse horário não está disponível. Consulte a disponibilidade e ofereça outro." };
      const visit = await prisma.$transaction(async (tx) => {
        const count = await tx.visit.count({ where: { clientId: ctx.clientId, scheduledAt: dt } });
        if (count >= cfg.capacityPerSlot) return null;
        return tx.visit.create({ data: {
          clientId: ctx.clientId, contactId: ctx.contactId, leadName: String(args.nome ?? ctx.contactName ?? "Lead"),
          leadPhone: (args.telefone as string) || ctx.contactWaId, car: (args.carro as string) || null,
          scheduledAt: dt, durationMin: cfg.slotMinutes, status: "agendada", source: "ia",
        } });
      });
      if (!visit) return { result: "Horário acabou de ser ocupado. Ofereça outro." };
      return { result: `Visita agendada para ${dt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}. Confirme com o lead.`, decision: "agendou" };
    }

    case "atualizar_perfil": {
      const data = {
        productInterest: (args.produto as string) || undefined,
        budget: (args.orcamento as string) || undefined,
        hasTradeIn: typeof args.tem_troca === "boolean" ? args.tem_troca : undefined,
        wantsFinancing: typeof args.quer_financiamento === "boolean" ? args.quer_financiamento : undefined,
      };
      const prof = await prisma.leadProfile.upsert({
        where: { contactId: ctx.contactId },
        create: { connectionId: ctx.connectionId, contactId: ctx.contactId, ...data },
        update: data,
      });
      const score = (prof.productInterest ? 30 : 0) + (prof.budget ? 25 : 0) + (prof.wantsFinancing ? 15 : 0) + (prof.hasTradeIn ? 15 : 0);
      await prisma.leadProfile.update({ where: { contactId: ctx.contactId }, data: { score, qualified: score >= 50 } });
      return { result: `Perfil atualizado (score ${score}${score >= 50 ? ", qualificado" : ""}).` };
    }

    case "escalar_humano": {
      return { result: "Ok. Diga ao lead que um vendedor dará sequência e registre o motivo. Não prometa prazo específico.", decision: "escalou" };
    }

    default:
      return { result: "Ferramenta desconhecida." };
  }
}
