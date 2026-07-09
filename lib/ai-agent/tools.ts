import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { ToolDef } from "@/lib/openai";
import { slotsForDate, isSlotAvailable, DEFAULT_WINDOWS, type VisitCfg, type Window } from "@/lib/visit-availability";
import { wallToInstant } from "@/lib/tz";
import { computeQuote, describeRules, type PricingRules } from "./pricing";
import { parseSpec, sanitizeIntake, summarizeIntake, missingRequired, type IntakeData } from "./intake";
import { renderQuotePdf } from "@/lib/quote-pdf";
import { sendWhatsAppDocument } from "@/lib/whatsapp-send";
import { embed } from "@/lib/openai";

export interface ToolCtx {
  clientId: string;
  connectionId: string;
  contactId: string;
  contactName: string | null;
  contactWaId: string;
  mode: "live" | "test"; // test: tools que escrevem apenas simulam (não gravam)
  intakeSpec?: unknown; // F2: ficha configurável (AiAgentConfig.intakeSpec)
}

const brl = (v: number, currency = "BRL") => v.toLocaleString("pt-BR", { style: "currency", currency });

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

// ── F2: ferramentas de orçamento (expostas só quando habilitadas na config) ───
const INTAKE_TOOL: ToolDef = {
  type: "function",
  function: {
    name: "atualizar_ficha",
    description: "Registra dados estruturados do lead conforme a ficha configurada. Chame ao descobrir qualquer campo pedido (modelo, medidas, opcionais, endereço...).",
    parameters: { type: "object", properties: {
      campos: { type: "object", description: "pares chave:valor conforme a ficha, ex: {\"modelo\":\"X\",\"largura\":200}" },
    }, required: ["campos"] },
  },
};

const QUOTE_TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "gerar_orcamento",
      description: "Gera o orçamento a partir dos itens escolhidos. O PREÇO vem SEMPRE desta ferramenta — nunca invente valores. Use exatamente as chaves do catálogo retornado.",
      parameters: { type: "object", properties: {
        base: { type: "array", items: { type: "string" }, description: "chaves dos itens-base escolhidos" },
        opcionais: { type: "array", items: { type: "string" }, description: "chaves dos opcionais" },
        quantidades: { type: "object", description: "chave:quantidade (opcional; padrão 1)" },
      }, required: ["base"] },
    },
  },
  {
    type: "function",
    function: {
      name: "enviar_orcamento",
      description: "Gera o PDF do orçamento e envia ao lead pelo WhatsApp. Use após gerar_orcamento e confirmar com o lead que pode enviar.",
      parameters: { type: "object", properties: { quoteId: { type: "string", description: "opcional; padrão = último orçamento em rascunho" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "aprovar_orcamento",
      description: "Use SOMENTE quando o lead aprovar o orçamento ou disser claramente que quer comprar. Passa o lead quente a um vendedor com briefing. Não use para dúvidas.",
      parameters: { type: "object", properties: {
        motivo: { type: "string", description: "ex: 'aprovou o orçamento Nº 12' ou 'quer fechar'" },
        quoteId: { type: "string" },
      }, required: ["motivo"] },
    },
  },
];

// F3: memória de longo prazo.
const MEMORY_TOOL: ToolDef = {
  type: "function",
  function: {
    name: "registrar_memoria",
    description: "Guarda um fato DURÁVEL sobre o lead para lembrar em conversas FUTURAS (preferência, algo que já comprou, contexto pessoal relevante). Não registre trivialidades nem o que já está na ficha.",
    parameters: { type: "object", properties: {
      conteudo: { type: "string", description: "o fato a lembrar, curto e objetivo" },
      tipo: { type: "string", enum: ["fact", "preference", "event"] },
      importancia: { type: "integer", description: "1 (baixa) a 5 (alta)" },
    }, required: ["conteudo"] },
  },
};

// Ferramentas efetivas por cliente: base + ficha + orçamento + memória (conforme a config).
export function toolsForConfig(cfg: { intakeSpec?: unknown; quotesEnabled?: boolean; memoryEnabled?: boolean } | null): ToolDef[] {
  const defs = [...TOOL_DEFS];
  if (cfg?.intakeSpec && Array.isArray(cfg.intakeSpec) && cfg.intakeSpec.length) defs.push(INTAKE_TOOL);
  if (cfg?.quotesEnabled) defs.push(...QUOTE_TOOLS);
  if (cfg?.memoryEnabled) defs.push(MEMORY_TOOL);
  return defs;
}

async function getVisitCfg(clientId: string): Promise<{ cfg: VisitCfg; tz: string }> {
  const c = await prisma.visitConfig.findUnique({ where: { clientId } });
  if (!c) return { cfg: { slotMinutes: 60, capacityPerSlot: 1, windows: DEFAULT_WINDOWS }, tz: "America/Sao_Paulo" };
  return {
    cfg: { slotMinutes: c.slotMinutes, capacityPerSlot: c.capacityPerSlot, windows: (c.windows as unknown as Window[]) ?? DEFAULT_WINDOWS },
    tz: c.timezone || "America/Sao_Paulo",
  };
}

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
      return { result: `Itens disponíveis (confirme a disponibilidade na visita):\n${list}`, decision: "respondeu_duvida" };
    }

    case "consultar_disponibilidade": {
      const dateStr = String(args.data ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return { result: "Data inválida (use AAAA-MM-DD)." };
      const { cfg, tz } = await getVisitCfg(ctx.clientId);
      const dayStart = wallToInstant(dateStr, "00:00", tz);
      const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
      const booked = await prisma.visit.findMany({ where: { clientId: ctx.clientId, scheduledAt: { gte: dayStart, lt: dayEnd } }, select: { scheduledAt: true } });
      const slots = slotsForDate(cfg, dateStr, booked.map((b) => b.scheduledAt), tz);
      return { result: slots.length ? `Horários livres em ${dateStr}: ${slots.join(", ")}` : `Sem horários livres em ${dateStr}. Ofereça outra data.` };
    }

    case "marcar_visita": {
      const dateStr = String(args.data ?? "");
      const timeStr = String(args.hora ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !/^\d{2}:\d{2}$/.test(timeStr)) return { result: "Data/hora inválida (AAAA-MM-DD e HH:MM)." };
      const { cfg, tz } = await getVisitCfg(ctx.clientId);
      const dt = wallToInstant(dateStr, timeStr, tz);
      if (dt.getTime() <= Date.now()) return { result: "Esse horário já passou. Ofereça um horário futuro." };
      if (dt.getTime() > Date.now() + 90 * 24 * 3600 * 1000) return { result: "Data muito distante. Sugira algo nas próximas semanas." };

      // Modo teste: valida disponibilidade real, mas NÃO grava visita.
      if (ctx.mode === "test") {
        const count = await prisma.visit.count({ where: { clientId: ctx.clientId, scheduledAt: dt } });
        if (!isSlotAvailable(cfg, dateStr, timeStr, count)) return { result: "(teste) Horário indisponível — ofereça outro." };
        return { result: `(teste) Agendaria para ${dateStr} às ${timeStr} (não gravado).`, decision: "agendou" };
      }

      // Anti-spam: limite de agendamentos por contato em 24h.
      const recent = await prisma.visit.count({ where: { clientId: ctx.clientId, contactId: ctx.contactId, source: "ia", createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } });
      if (recent >= 3) return { result: "Já há agendamentos recentes para este contato. Sugira confirmar com um vendedor." };

      try {
        const visit = await prisma.$transaction(async (tx) => {
          const count = await tx.visit.count({ where: { clientId: ctx.clientId, scheduledAt: dt } });
          if (!isSlotAvailable(cfg, dateStr, timeStr, count)) return null;
          return tx.visit.create({ data: {
            clientId: ctx.clientId, contactId: ctx.contactId, leadName: String(args.nome ?? ctx.contactName ?? "Lead"),
            leadPhone: (args.telefone as string) || ctx.contactWaId, car: (args.carro as string) || null,
            scheduledAt: dt, durationMin: cfg.slotMinutes, status: "agendada", source: "ia",
          } });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        if (!visit) return { result: "Esse horário não está disponível. Consulte a disponibilidade e ofereça outro." };
        return { result: `Visita agendada para ${dateStr} às ${timeStr}. Confirme com o lead.`, decision: "agendou" };
      } catch {
        return { result: "Esse horário acabou de ser ocupado. Ofereça outro." };
      }
    }

    case "atualizar_perfil": {
      if (ctx.mode === "test") return { result: "(teste) Perfil seria atualizado (não gravado)." };
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

    // ── F2: coleta estruturada ─────────────────────────────────────────────────
    case "atualizar_ficha": {
      const spec = parseSpec(ctx.intakeSpec);
      if (!spec.length) return { result: "Nenhuma ficha configurada para este cliente." };
      const { data, invalidOptions } = sanitizeIntake(spec, (args.campos as Record<string, unknown>) ?? {});
      if (ctx.mode === "test") return { result: `(teste) Ficha: ${summarizeIntake(spec, data) || "nada válido"}.` };

      const existing = await prisma.leadProfile.findUnique({ where: { contactId: ctx.contactId } });
      const merged: IntakeData = { ...((existing?.data as IntakeData) ?? {}), ...data };
      await prisma.leadProfile.upsert({
        where: { contactId: ctx.contactId },
        create: { connectionId: ctx.connectionId, contactId: ctx.contactId, data: merged as unknown as Prisma.InputJsonValue },
        update: { data: merged as unknown as Prisma.InputJsonValue },
      });
      const missing = missingRequired(spec, merged);
      const inval = invalidOptions.length ? ` Valores inválidos (ignorados): ${invalidOptions.join(", ")}.` : "";
      return { result: missing.length ? `Ficha atualizada. Ainda falta: ${missing.map((f) => f.label).join(", ")}.${inval}` : `Ficha completa.${inval}` };
    }

    // ── F2: gerar orçamento (preço determinístico — nunca inventado) ────────────
    case "gerar_orcamento": {
      const pc = await prisma.pricingConfig.findUnique({ where: { clientId: ctx.clientId } });
      if (!pc) return { result: "Sem tabela de preço configurada. Não invente valores: encaminhe para um vendedor." };
      const rules = pc.rules as unknown as PricingRules;
      const sel = { base: (args.base as string[]) ?? [], options: (args.opcionais as string[]) ?? [], quantities: (args.quantidades as Record<string, number>) ?? undefined };
      const r = computeQuote(rules, sel);
      if (!r.ok) return { result: `Chaves inválidas: ${r.unknownKeys.join(", ")}. Use SOMENTE as chaves do catálogo:\n${describeRules(rules)}` };

      const q = r.quote;
      const summary = q.items.map((i) => i.label).join(", ");
      if (ctx.mode === "test") return { result: `(teste) Orçamento: ${brl(q.total, pc.currency)} (não gravado). Itens: ${summary}.`, decision: "orcou" };

      const last = await prisma.quote.findFirst({ where: { clientId: ctx.clientId }, orderBy: { number: "desc" }, select: { number: true } });
      const number = (last?.number ?? 0) + 1;
      const prof = await prisma.leadProfile.findUnique({ where: { contactId: ctx.contactId } });
      await prisma.quote.create({ data: {
        clientId: ctx.clientId, contactId: ctx.contactId, number,
        items: q.items as unknown as Prisma.InputJsonValue, subtotal: q.subtotal, fees: q.fees, total: q.total,
        currency: pc.currency, status: "draft", summary, intake: (prof?.data as Prisma.InputJsonValue) ?? undefined,
      } });
      const linhas = q.items.map((i) => `- ${i.label}: ${brl(i.amount, pc.currency)}`).join("\n");
      return { result: `Orçamento Nº ${number} gerado (fonte oficial de preço):\n${linhas}\nTotal: ${brl(q.total, pc.currency)}.\nApresente ao lead e pergunte se pode enviar o PDF.`, decision: "orcou" };
    }

    // ── F2: enviar o PDF do orçamento pelo WhatsApp ────────────────────────────
    case "enviar_orcamento": {
      const quote = args.quoteId
        ? await prisma.quote.findFirst({ where: { id: String(args.quoteId), clientId: ctx.clientId } })
        : await prisma.quote.findFirst({ where: { clientId: ctx.clientId, contactId: ctx.contactId, status: "draft" }, orderBy: { createdAt: "desc" } });
      if (!quote) return { result: "Nenhum orçamento encontrado para enviar. Gere um com gerar_orcamento." };
      if (ctx.mode === "test") return { result: `(teste) Enviaria o PDF do orçamento Nº ${quote.number} (não enviado).`, decision: "orcou" };

      const conn = await prisma.waConnection.findUnique({ where: { id: ctx.connectionId } });
      if (!conn) return { result: "Conexão de WhatsApp indisponível para envio." };
      const client = await prisma.client.findUnique({ where: { id: ctx.clientId }, select: { name: true } });

      try {
        const pdf = await renderQuotePdf({
          clientName: client?.name ?? "Orçamento", number: quote.number, contactName: ctx.contactName,
          items: quote.items as unknown as { label: string; qty: number; unit: number; amount: number }[],
          subtotal: quote.subtotal, fees: quote.fees, total: quote.total, currency: quote.currency,
          summary: quote.summary, generatedAt: new Date().toLocaleDateString("pt-BR"),
        });
        const sent = await sendWhatsAppDocument(
          { phoneNumberId: conn.phoneNumberId, accessToken: conn.accessToken }, ctx.contactWaId,
          { buffer: pdf, filename: `orcamento-${quote.number}.pdf`, caption: `Orçamento Nº ${quote.number}` },
        );
        if (!sent.ok) return { result: `Falha ao enviar o PDF: ${sent.error}. Ofereça tentar de novo ou chamar um vendedor.` };
        await prisma.quote.update({ where: { id: quote.id }, data: { status: "sent" } });
        return { result: `Orçamento Nº ${quote.number} enviado ao lead em PDF. Confirme o recebimento e tire dúvidas.`, decision: "orcou" };
      } catch (e) {
        return { result: `Não consegui gerar/enviar o PDF (${String(e).slice(0, 80)}). Ofereça chamar um vendedor.` };
      }
    }

    // ── F2: handoff por intenção real (lead quente → vendedor com briefing) ─────
    case "aprovar_orcamento": {
      const quote = args.quoteId
        ? await prisma.quote.findFirst({ where: { id: String(args.quoteId), clientId: ctx.clientId } })
        : await prisma.quote.findFirst({ where: { clientId: ctx.clientId, contactId: ctx.contactId }, orderBy: { createdAt: "desc" } });
      if (ctx.mode === "test") return { result: "(teste) Marcaria o lead como quente e criaria o handoff.", decision: "escalou" };

      const prof = await prisma.leadProfile.findUnique({ where: { contactId: ctx.contactId } });
      const recent = await prisma.waMessage.findMany({ where: { contactId: ctx.contactId }, orderBy: { timestamp: "desc" }, take: 10, select: { direction: true, text: true } });
      const resumo = [...recent].reverse().filter((m) => m.text).map((m) => `${m.direction === "in" ? "Lead" : "IA"}: ${m.text}`);
      const briefing = {
        motivo: String(args.motivo ?? ""),
        ficha: (prof?.data as IntakeData) ?? null,
        orcamento: quote ? { numero: quote.number, total: quote.total, currency: quote.currency } : null,
        resumo,
      };
      await prisma.handoff.create({ data: {
        clientId: ctx.clientId, contactId: ctx.contactId, reason: String(args.motivo ?? "quer_comprar"),
        briefing: briefing as unknown as Prisma.InputJsonValue, quoteId: quote?.id ?? null, status: "pending",
      } });
      if (quote) await prisma.quote.update({ where: { id: quote.id }, data: { status: "approved" } });
      if (prof) await prisma.leadProfile.update({ where: { contactId: ctx.contactId }, data: { qualified: true } });
      return { result: "Lead marcado como QUENTE e enviado a um vendedor com o briefing (ficha + orçamento + resumo). Diga ao lead que um vendedor dará sequência para fechar. Não prometa prazo.", decision: "escalou" };
    }

    // ── F3: memória de longo prazo ─────────────────────────────────────────────
    case "registrar_memoria": {
      const conteudo = String(args.conteudo ?? "").trim();
      if (!conteudo) return { result: "Nada para registrar." };
      if (ctx.mode === "test") return { result: `(teste) Memória registraria: "${conteudo}".` };
      const importancia = Math.min(Math.max(Math.round(Number(args.importancia ?? 2)), 1), 5);
      const kind = ["fact", "preference", "event"].includes(String(args.tipo)) ? String(args.tipo) : "fact";
      let embedding: number[] = [];
      try { const [e] = await embed([conteudo]); embedding = e ?? []; } catch { /* segue sem embedding (recall por importância) */ }
      await prisma.leadMemory.create({ data: { clientId: ctx.clientId, contactId: ctx.contactId, content: conteudo, kind, importance: importancia, embedding } });
      return { result: "Memória registrada — vou lembrar disso nas próximas conversas." };
    }

    default:
      return { result: "Ferramenta desconhecida." };
  }
}
