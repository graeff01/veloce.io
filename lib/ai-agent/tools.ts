import { prisma } from "@/lib/prisma";
import type { ToolDef } from "@/lib/openai";
import { scoreLead, funnelStageFor, shouldAdvanceStage } from "./scoring";
import { createEscalationTask } from "./escalation";
import { sendWhatsAppImage } from "@/lib/whatsapp-send";
import { searchCatalog } from "./catalog-search";

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
        uso_motivacao: { type: "string", description: "pra que/por que quer o carro: família, trabalho, primeiro carro, viagem, upgrade" },
        prioridade: { type: "string", description: "o que mais pesa na decisão dele: preço, economia, segurança/procedência, espaço, status, ou o financiamento caber" },
        estagio_decisao: { type: "string", description: "em que pé está: 'pesquisando', 'comparando modelos' ou 'decidido' (só falta fechar)" },
      } },
    },
  },
  {
    type: "function",
    function: {
      name: "enviar_foto",
      description: "Envia ao lead a(s) FOTO(s) do veículo. Na abertura mande SÓ 1 (a capa). Só mande mais (2-3) se o lead PEDIR mais fotos ou perguntar do interior — nunca encha de fotos.",
      parameters: { type: "object", properties: {
        termo: { type: "string", description: "modelo do veículo, se diferente do de interesse do lead" },
        quantidade: { type: "number", description: "quantas fotos enviar (1 = só a capa; 2-3 só quando o lead pedir mais)" },
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
      const items = await searchCatalog(ctx.clientId, termo);
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
        usageContext: (args.uso_motivacao as string) || undefined,
        buyingPriority: (args.prioridade as string) || undefined,
        decisionStage: (args.estagio_decisao as string) || undefined,
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

      // Classificação automática no funil (avanço-only; nunca regride nem toca estágio
      // terminal/manual do operador).
      const convo = await prisma.waConversation.findUnique({ where: { contactId: ctx.contactId }, select: { funnelStage: true } });
      const nextStage = funnelStageFor(prof);
      if (shouldAdvanceStage(convo?.funnelStage, nextStage)) {
        await prisma.waConversation.updateMany({ where: { contactId: ctx.contactId }, data: { funnelStage: nextStage } }).catch(() => {});
      }

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

    case "enviar_foto": {
      let term = String(args.termo ?? "").trim();
      if (!term) {
        const lead = await prisma.waLead.findUnique({ where: { contactId: ctx.contactId }, select: { adModel: true, adTitle: true } });
        term = (lead?.adModel || lead?.adTitle || "").trim();
      }
      if (!term) return { result: "Não sei qual veículo o lead quer ver. Pergunte qual modelo e tente de novo." };
      // Busca robusta (tokens + fuzzy) — casa "Taos Highline" mesmo com "1.4" no meio do título.
      const matches = await searchCatalog(ctx.clientId, term);
      const item = (matches.find((i) => i.imageUrl) ?? matches[0]) as (typeof matches)[number] & { images?: string[] } | undefined;
      // Lista de fotos: capa + galeria, sem duplicar. Quantidade limitada (1 na abertura, até 3 sob pedido).
      const gallery = Array.isArray(item?.images) ? item!.images : [];
      const photos = [...new Set([item?.imageUrl, ...gallery].filter(Boolean))] as string[];
      if (!photos.length) return { result: "Sem foto cadastrada desse veículo. Ofereça que o vendedor envia as fotos, ou siga por texto." };
      const qtd = Math.max(1, Math.min(3, Number(args.quantidade) || 1));
      const toSend = photos.slice(0, qtd);
      if (ctx.mode === "test") return { result: `(teste) Enviaria ${toSend.length} foto(s) de ${item!.title} (não enviado).` };

      const conn = await prisma.waConnection.findUnique({ where: { id: ctx.connectionId }, select: { phoneNumberId: true, accessToken: true } });
      if (!conn) return { result: "Conexão indisponível para enviar a foto." };
      let okCount = 0;
      for (const link of toSend) {
        const sent = await sendWhatsAppImage(conn, ctx.contactWaId, link, okCount === 0 ? item!.title : undefined);
        if (!sent.ok) break;
        okCount++;
        await prisma.waMessage.create({ data: {
          connectionId: ctx.connectionId, contactId: ctx.contactId, waMessageId: sent.waMessageId || `ia-img-${Date.now()}-${okCount}`,
          direction: "out", type: "image", text: `[foto] ${item!.title}`, aiGenerated: true, timestamp: new Date(),
        } }).catch(() => {});
      }
      if (okCount === 0) return { result: "Não consegui enviar a foto agora; siga por texto e ofereça que o vendedor envia." };
      return { result: `${okCount} foto(s) de ${item!.title} enviada(s). Comente CURTINHO (ex: "te mandei umas fotos dele 😊") e PARE — NÃO emende pergunta tipo "quer saber mais algum detalhe?"; deixe o lead ver e reagir. Não reenvie fotos sem o lead pedir.` };
    }

    case "escalar_humano": {
      return { result: "Ok. Diga ao lead que um vendedor dará sequência no horário comercial e registre o motivo. Não prometa prazo específico.", decision: "escalou" };
    }

    default:
      return { result: "Ferramenta desconhecida." };
  }
}
