import { prisma } from "@/lib/prisma";
import type { ToolDef } from "@/lib/openai";
import { scoreLead } from "./scoring";
import { createEscalationTask } from "./escalation";

export interface ToolCtx {
  clientId: string;
  connectionId: string;
  contactId: string;
  contactName: string | null;
  contactWaId: string;
  mode: "live" | "test"; // test: tools que escrevem apenas simulam (não gravam)
}

// O agente NÃO agenda visita: ele atende fora do horário, entende o que o lead quer,
// qualifica e adianta tudo ao vendedor (que dá sequência no horário comercial).
export const TOOL_DEFS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "buscar_estoque",
      description: "Busca produtos no catálogo do cliente (ex: carros). Use SEMPRE que o lead perguntar sobre produto/preço/ficha técnica. Nunca invente.",
      parameters: { type: "object", properties: { termo: { type: "string", description: "modelo/termo procurado, ex: 'Taos' ou 'SUV até 120 mil'" } }, required: ["termo"] },
    },
  },
  {
    type: "function",
    function: {
      name: "atualizar_perfil",
      description: "Registra/qualifica o lead para adiantar ao vendedor. Chame sempre que descobrir qualquer informação nova: interesse, orçamento, troca, financiamento, urgência/prazo, intenção de visita ou de fechar.",
      parameters: { type: "object", properties: {
        produto: { type: "string", description: "veículo/modelo de interesse" },
        orcamento: { type: "string", description: "faixa de valor que o lead pretende gastar" },
        tem_troca: { type: "boolean" },
        troca_veiculo: { type: "string", description: "dados do veículo da troca: modelo, ano, km aprox., estado" },
        quer_financiamento: { type: "boolean" },
        financiamento_detalhe: { type: "string", description: "condições pretendidas: valor de entrada, prazo desejado, se usa a troca como parte do pagamento" },
        urgencia: { type: "string", description: "prazo de compra em texto, ex: 'essa semana', 'esse mês', 'sem pressa'" },
        quer_visitar: { type: "boolean", description: "demonstrou intenção de ir à loja / ver de perto / test drive" },
        pronto_para_comprar: { type: "boolean", description: "sinal forte: quer fechar, pediu proposta, decidido" },
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

export interface ToolResult { result: string; decision?: string }

export async function executeTool(name: string, args: Record<string, unknown>, ctx: ToolCtx): Promise<ToolResult> {
  // Isolamento multi-tenant: toda query abaixo é escopada por ctx.clientId/contactId.
  if (!ctx.clientId || !ctx.contactId) throw new Error("tenant ausente no contexto da tool");

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
      return { result: `Itens disponíveis (disponibilidade final confirmada pelo vendedor):\n${list}`, decision: "respondeu_duvida" };
    }

    case "atualizar_perfil": {
      if (ctx.mode === "test") return { result: "(teste) Perfil seria atualizado (não gravado)." };
      const trocaDetalhe = (args.troca_veiculo as string) || undefined;
      const finDetalhe = (args.financiamento_detalhe as string) || undefined;
      const data = {
        productInterest: (args.produto as string) || undefined,
        budget: (args.orcamento as string) || undefined,
        // Mencionar dados da troca implica que TEM troca (mesmo sem o booleano vir).
        hasTradeIn: typeof args.tem_troca === "boolean" ? args.tem_troca : (trocaDetalhe ? true : undefined),
        tradeInDetail: trocaDetalhe,
        wantsFinancing: typeof args.quer_financiamento === "boolean" ? args.quer_financiamento : (finDetalhe ? true : undefined),
        financingDetail: finDetalhe,
        urgency: (args.urgencia as string) || undefined,
        visitIntent: typeof args.quer_visitar === "boolean" ? args.quer_visitar : undefined,
        readyToBuy: typeof args.pronto_para_comprar === "boolean" ? args.pronto_para_comprar : undefined,
      };
      // Atualiza dados e relê o perfil consolidado para repontuar (estado, não delta).
      const prevTemp = (await prisma.leadProfile.findUnique({ where: { contactId: ctx.contactId }, select: { temperature: true } }))?.temperature ?? null;
      const prof = await prisma.leadProfile.upsert({
        where: { contactId: ctx.contactId },
        create: { connectionId: ctx.connectionId, contactId: ctx.contactId, ...data },
        update: data,
      });
      const { score, temperature } = scoreLead(prof);
      await prisma.leadProfile.update({ where: { contactId: ctx.contactId }, data: { score, temperature, qualified: temperature !== "cold" } });

      // CRM/comercial: ao esquentar para HOT, avisa o time (idempotente, 1x/dia).
      if (temperature === "hot" && prevTemp !== "hot") {
        await createEscalationTask({
          clientId: ctx.clientId, contactId: ctx.contactId, contactName: ctx.contactName, waId: ctx.contactWaId,
          reason: `Lead atingiu score ${score} (HOT). Sinais: ${[prof.readyToBuy && "quer fechar", prof.visitIntent && "quer visitar", prof.urgency && `urgência: ${prof.urgency}`, prof.budget && `orçamento: ${prof.budget}`].filter(Boolean).join("; ")}.`,
          kind: "hot",
        }).catch(() => {});
      }
      return { result: `Perfil atualizado (score ${score}, ${temperature}).` };
    }

    case "escalar_humano": {
      return { result: "Ok. Diga ao lead que um vendedor dará sequência no horário comercial e registre o motivo. Não prometa prazo específico.", decision: "escalou" };
    }

    default:
      return { result: "Ferramenta desconhecida." };
  }
}
