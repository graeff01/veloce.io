import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { ToolDef } from "@/lib/openai";
import { scoreLead, funnelStageFor } from "./scoring";
import { applyProfileStage } from "./funnel-shadow";
import { createEscalationTask } from "./escalation";
import { pushPortalReview, pushPortalFechamento } from "@/lib/notifications/portal-push";
import { sendWhatsAppText, sendWhatsAppImage, sendWhatsAppDocument, sendWhatsAppDocumentByUrl, sendWhatsAppVideo, sendWhatsAppLocationRequest, sendWhatsAppReaction, sendWhatsAppLocation } from "@/lib/whatsapp-send";
import { geocodeAddress } from "@/lib/geocode";
import { searchCatalog } from "./catalog-search";
import { computeQuote, describeRules, resolveFreight, appendFeeLine, type PricingRules } from "./pricing";
import { parseSpec, sanitizeIntake, summarizeIntake, missingRequired, type IntakeData } from "./intake";
import { renderQuotePdf, type QuoteDocData } from "@/lib/quote-pdf";

// Normaliza nome de cidade (minúsculo, sem acento/pontuação) p/ comparar.
const normCity = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
// Cidades divergem? Tolera "Porto Alegre" vs "Porto Alegre Zona Sul" (por inclusão).
function citiesDiffer(a: string, b: string): boolean {
  const x = normCity(a), y = normCity(b);
  if (!x || !y) return false;
  return !(x.includes(y) || y.includes(x));
}

export interface ToolCtx {
  clientId: string;
  connectionId: string;
  contactId: string;
  contactName: string | null;
  contactWaId: string;
  mode: "live" | "test"; // test: tools que escrevem apenas simulam (não gravam)
  intakeSpec?: unknown; // ficha configurável (AiAgentConfig.intakeSpec) p/ orçamento
  quoteReview?: boolean; // modo revisão: o PDF NÃO vai ao lead — fica retido p/ um vendedor aprovar na fila
  // Ficha EFÊMERA do modo teste (Console): atualizar_ficha não grava no banco, então
  // acumula aqui p/ gerar_orcamento enxergar o que foi coletado (gate + frete) na mesma run.
  testFicha?: IntakeData;
  inboundText?: string;   // última mensagem do lead — usado pela trava anti-reenvio de foto
  isFirstTurn?: boolean;  // 1ª mensagem da conversa (abertura) — libera a foto de entrada
  videoAlreadySent?: boolean; // já mandou o vídeo de apresentação nesta conversa (trava anti-reenvio, vale no teste)
}

const brl = (v: number, currency = "BRL") => v.toLocaleString("pt-BR", { style: "currency", currency });

// O agente NÃO agenda visita: ele atende fora do horário, entende o que o lead quer,
// qualifica e adianta tudo ao vendedor (que dá sequência no horário comercial).
export const TOOL_DEFS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "buscar_estoque",
      description: "Busca produtos no catálogo (ex: carros) por modelo E/OU faixa de preço. Use SEMPRE que o lead perguntar produto/preço/ficha, ou der um ORÇAMENTO/faixa. Se não houver na faixa, retorna os mais próximos/em conta pra você oferecer. Nunca invente.",
      parameters: { type: "object", properties: {
        termo: { type: "string", description: "modelo/termo procurado, ex: 'Taos'. Opcional se buscar só por preço." },
        preco_de: { type: "number", description: "preço MÍNIMO em reais, se o lead deu uma faixa (ex: 20000)" },
        preco_ate: { type: "number", description: "preço MÁXIMO em reais / orçamento do lead (ex: 25000). Se não houver nessa faixa, volta os mais em conta." },
      } },
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
        forma_pagamento: { type: "string", enum: ["avista", "financiado", "indeciso"], description: "forma de pagamento que o lead revelou" },
        entrada: { type: "string", description: "entrada pretendida que o lead informou (texto/faixa, ex: '10 mil')" },
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
        quantidade: { type: "number", description: "quantas fotos enviar (1 = só a capa; 4-5 quando o lead pede mais / ver por dentro)" },
        interior: { type: "boolean", description: "true quando o lead quer ver o INTERIOR / por dentro — manda as fotos internas (do final da galeria), não as externas" },
      } },
    },
  },
  {
    type: "function",
    function: {
      name: "escalar_humano",
      description: "Aciona um vendedor humano DE VERDADE. Use quando o lead QUER FECHAR/negociar (desconto, valor final, 'quero fechar/reservar'), pedir APROVAÇÃO de financiamento ou avaliação de troca em R$, ou INSISTIR num número/condição que você não pode dar. NÃO use para uma dúvida de DADO que você só não tem (spec, item, estepe, consumo): nesse caso responda por texto que confirma com o vendedor, sem handoff.",
      parameters: { type: "object", properties: { motivo: { type: "string" } }, required: ["motivo"] },
    },
  },
  {
    type: "function",
    function: {
      name: "reagir",
      description: "Reage à ÚLTIMA mensagem do lead com um emoji (como uma pessoa dá um ❤️/👍 no WhatsApp). Use com PARCIMÔNIA e só quando for natural: o lead demonstrou empolgação ('amei!', 'ficou linda'), concordou/fechou ('fechado!', 'pode ser'), agradeceu, ou mandou uma foto legal. NÃO reaja a toda mensagem, nem a perguntas ou reclamações. Na maioria das vezes NÃO reaja.",
      parameters: { type: "object", properties: {
        emoji: { type: "string", enum: ["❤️", "👍", "🔥", "😊", "👏", "🙏"], description: "emoji que combina com o momento" },
      }, required: ["emoji"] },
    },
  },
  {
    type: "function",
    function: {
      name: "enviar_localizacao_loja",
      description: "Envia o PIN da loja/fábrica no mapa (o lead abre no GPS num toque). Use quando o lead quiser VISITAR, RETIRAR no local, ou perguntar ONDE fica / qual o endereço. NÃO invente endereço — a ferramenta usa o cadastrado.",
      parameters: { type: "object", properties: {} },
    },
  },
];

// ── Ferramentas de ORÇAMENTO (expostas só quando quotesEnabled) ───────────────
const INTAKE_TOOL: ToolDef = {
  type: "function",
  function: {
    name: "atualizar_ficha",
    description: "Registra dados estruturados do lead conforme a ficha configurada (modelo, medidas, opcionais, endereço...). Chame ao descobrir cada dado.",
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
      description: "Gera o orçamento a partir dos itens escolhidos. O PREÇO vem SEMPRE desta ferramenta — nunca invente valores. Use exatamente as chaves do catálogo.",
      parameters: { type: "object", properties: {
        base: { type: "array", items: { type: "string" }, description: "chaves dos itens-base escolhidos" },
        opcionais: { type: "array", items: { type: "string" }, description: "chaves dos opcionais" },
        quantidades: { type: "object", description: "chave:quantidade (opcional; padrão 1)" },
        montagem: { type: "boolean", description: "inclui entrega + montagem (o motor soma a montagem de cada produto com desconto por quantidade). Frete acima do limite exige montagem." },
        pagamento: { type: "string", enum: ["dinheiro", "cartao", "pix", "debito"], description: "forma de pagamento (dinheiro dá desconto à vista nos produtos)" },
        acesso: { type: "object", description: "acesso p/ a montagem: { lances: number (0 = térreo), tipo: 'tradicional'|'caracol', elevador: boolean }", properties: {
          lances: { type: "number" }, tipo: { type: "string", enum: ["tradicional", "caracol"] }, elevador: { type: "boolean" },
        } },
        retirada: { type: "boolean", description: "true se o cliente vai RETIRAR na fábrica (sem frete). Nesse caso NÃO cobra frete e não precisa de endereço." },
      }, required: ["base"] },
    },
  },
  {
    type: "function",
    function: {
      name: "enviar_orcamento",
      description: "Gera o PDF do orçamento e envia ao lead. Use após gerar_orcamento e confirmar com o lead que pode enviar.",
      parameters: { type: "object", properties: { quoteId: { type: "string", description: "opcional; padrão = último em rascunho" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "aprovar_orcamento",
      description: "Use SOMENTE quando o lead aprovar o orçamento ou disser que quer comprar. Aciona um vendedor com o contexto. Não use para dúvidas.",
      parameters: { type: "object", properties: { motivo: { type: "string" }, quoteId: { type: "string" } }, required: ["motivo"] },
    },
  },
];

// Ferramentas efetivas por cliente: base (master) + orçamento/ficha se habilitado.
const VIDEO_TOOL: ToolDef = {
  type: "function",
  function: {
    name: "enviar_video",
    description: "Envia o VÍDEO de apresentação da empresa ao lead. Use no PRIMEIRO contato (cliente novo), antes de mostrar o catálogo — como a vendedora faz. Use uma vez só.",
    parameters: { type: "object", properties: {} },
  },
};

// Catálogo completo em PDF: mandado quando o cliente quer ver TUDO (não um modelo só).
const CATALOG_TOOL: ToolDef = {
  type: "function",
  function: {
    name: "enviar_catalogo",
    description: "Envia um CATÁLOGO COMPLETO em PDF ao lead. Use quando ele pedir 'o catálogo', 'ver os modelos', 'manda tudo', ou o catálogo completo. Escolha `categoria`: 'churrasqueira' (padrão — churrasqueiras, conjuntos, campeiros, complementos) OU 'lareira' (catálogo só das lareiras pré-moldadas). Uma vez por categoria — NÃO reenvie a mesma. Para um MODELO específico, use enviar_foto.",
    parameters: { type: "object", properties: { categoria: { type: "string", enum: ["churrasqueira", "lareira"], description: "qual catálogo enviar (padrão churrasqueira)" } } },
  },
};

// Pede a localização nativa do WhatsApp — usada SÓ nas cidades com várias zonas, p/ fixar
// a zona pela coordenada (bairro→zona) sem o cliente ter que saber/digitar a zona.
const LOCATION_TOOL: ToolDef = {
  type: "function",
  function: {
    name: "pedir_localizacao",
    description: "Envia o BOTÃO nativo de localização do WhatsApp — o cliente compartilha em 1 TOQUE (ideal p/ público mais velho). Use SOMENTE quando a cidade de entrega tem VÁRIAS ZONAS com fretes diferentes e você ainda não sabe a zona/bairro. CHAME a ferramenta DIRETO: não descreva o passo a passo de anexar localização, não peça permissão ('quer que eu peça?'). NÃO use em cidade de zona única. O cliente também pode responder o bairro por texto.",
    parameters: { type: "object", properties: {
      cidade: { type: "string", description: "cidade de entrega já identificada (só p/ personalizar a mensagem)" },
    } },
  },
};

const OPTIONS_TOOL: ToolDef = {
  type: "function",
  function: {
    name: "enviar_opcionais",
    description: "Envia a IMAGEM com os acessórios/opcionais (ex.: da Gourmet). Use quando o cliente pedir pra ver os opcionais/acessórios ou quando você for apresentar os opcionais de um modelo que tem essa imagem — a imagem mostra melhor que listar por texto. Uma vez por assunto.",
    parameters: { type: "object", properties: {} },
  },
};

export function toolsForConfig(cfg: { quotesEnabled?: boolean; intakeSpec?: unknown; presentationVideoUrl?: string | null; optionsImageUrl?: string | null; catalogPdfUrl?: string | null } | null): ToolDef[] {
  const defs = [...TOOL_DEFS];
  if (cfg?.quotesEnabled) {
    if (Array.isArray(cfg.intakeSpec) && cfg.intakeSpec.length) defs.push(INTAKE_TOOL);
    defs.push(...QUOTE_TOOLS, LOCATION_TOOL);
  }
  if (cfg?.presentationVideoUrl) defs.push(VIDEO_TOOL);
  if (cfg?.optionsImageUrl) defs.push(OPTIONS_TOOL);
  if (cfg?.catalogPdfUrl) defs.push(CATALOG_TOOL);
  return defs;
}

// Artefato visual devolvido por uma tool (foto/PDF) — para o Console mostrar como no
// WhatsApp. NÃO entra no contexto do modelo (só o `result` textual entra).
export interface ToolArtifact { kind: "image" | "pdf" | "audio" | "video" | "location_request"; url?: string; dataUri?: string; caption?: string; filename?: string }
export interface ToolResult { result: string; decision?: string; artifacts?: ToolArtifact[] }

export type QuoteLineIn = { code?: string | null; label: string; qty: number; unit: number; amount: number };

// Dados de apresentação do PDF (empresa/contatos/vendedor/observações) — de Client +
// PricingConfig.rules. `company` no rules pode trazer os contatos e redes do modelo do cliente.
interface PresRules {
  company?: { phone?: string | null; whatsapp?: string | null; address?: string | null; city?: string | null; cep?: string | null; email?: string | null; site?: string | null; website?: string | null; facebook?: string | null; instagram?: string | null };
  sellerName?: string | null; observacoes?: string | null; paymentTerms?: string | null; notes?: string | null; validityDays?: number;
  installments?: number; // parcelas SEM JUROS (ex.: 10) — se setado, mostra "Nx de R$Y" no orçamento
}

// "10x de R$ 253,00 sem juros" a partir do total — só quando o cliente configurou parcelas.
function installmentsLabel(total: number, currency: string, n: number | null | undefined): string | null {
  const parcelas = Number(n) > 1 ? Math.floor(Number(n)) : 0;
  if (!parcelas || total <= 0) return null;
  return `${parcelas}x de ${brl(total / parcelas, currency)} sem juros`;
}

// Monta o QuoteDocData (layout fiel: logo + contatos + Cliente/Vendedor + tabela c/ CÓDIGO +
// Total + Observações). Fonte única usada pelo Console (artefato) e pelo envio real.
export async function buildQuoteDocData(clientId: string, items: QuoteLineIn[], total: number, currency: string, contactName: string | null, number: number, contactCity?: string | null): Promise<QuoteDocData> {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true, logoUrl: true } });
  const pcfg = await prisma.pricingConfig.findUnique({ where: { clientId }, select: { rules: true } });
  const r = (pcfg?.rules ?? {}) as PresRules;
  const c = r.company ?? {};
  const validity = Number(r.validityDays) > 0 ? Number(r.validityDays) : null;
  const validUntil = validity ? new Date(Date.now() + validity * 86_400_000).toLocaleDateString("pt-BR") : null;
  // Item 7: o PDF adapta à forma de PAGAMENTO. Se o orçamento tem desconto à vista (dinheiro),
  // o total já vem com os 8% off → observação específica + abaixo do total mostra o valor
  // CHEIO parcelado (sem o desconto), pra o à vista e o 10x NÃO ficarem iguais. Sem desconto
  // (parcelado/pix/cartão) → observação padrão + 10x sobre o próprio total.
  const descLine = items.find((i) => /desconto\s+[àa]?\s*vista/i.test(i.label || ""));
  const inst = Number(r.installments) > 1 ? Math.floor(Number(r.installments)) : 0;
  const fullPrice = descLine ? Math.round((total - descLine.amount) * 100) / 100 : total; // descLine.amount é negativo
  const obsFinal = descLine
    ? "Valor válido para pagamento à vista em dinheiro (espécie)."
    : (r.observacoes ?? r.paymentTerms ?? r.notes ?? null);
  const instFinal = descLine
    ? (inst > 0 && fullPrice > 0 ? `${inst}x de ${brl(fullPrice / inst, currency)} sem juros (total ${brl(fullPrice, currency)} no parcelado)` : null)
    : installmentsLabel(total, currency, r.installments);
  return {
    company: {
      name: client?.name ?? "Orçamento", logoUrl: client?.logoUrl ?? null,
      phone: c.phone ?? null, whatsapp: c.whatsapp ?? null, address: c.address ?? null,
      city: c.city ?? null, cep: c.cep ?? null, email: c.email ?? null,
      website: c.website ?? c.site ?? null, facebook: c.facebook ?? null, instagram: c.instagram ?? null,
    },
    number, contactName, contactCity: contactCity ?? null, sellerName: r.sellerName ?? null,
    items: items.map((i) => ({ code: i.code ?? null, label: i.label, qty: i.qty, unit: i.unit, amount: i.amount })),
    total, currency, observacoes: obsFinal,
    installmentsLabel: instFinal,
    generatedAt: new Date().toLocaleDateString("pt-BR"), validUntil,
  };
}

// Renderiza o PDF do orçamento como artefato, para o Console exibir no modo teste.
// Best-effort: falha vira null (não quebra o fluxo).
async function quotePdfArtifact(clientId: string, q: { items: QuoteLineIn[]; total: number }, currency: string, contactName: string | null, number: number, contactCity?: string | null): Promise<ToolArtifact | null> {
  try {
    const pdf = await renderQuotePdf(await buildQuoteDocData(clientId, q.items, q.total, currency, contactName, number, contactCity));
    return { kind: "pdf", dataUri: `data:application/pdf;base64,${pdf.toString("base64")}`, filename: `orcamento-${number}.pdf`, caption: `Orçamento Nº ${number}` };
  } catch { return null; }
}

export async function executeTool(name: string, args: Record<string, unknown>, ctx: ToolCtx): Promise<ToolResult> {
  // Isolamento multi-tenant: toda query abaixo é escopada por ctx.clientId/contactId.
  if (!ctx.clientId || !ctx.contactId) throw new Error("tenant ausente no contexto da tool");

  switch (name) {
    case "buscar_estoque": {
      const termo = String(args.termo ?? "").trim();
      const precoDe = Number(args.preco_de) || 0;
      const precoAte = Number(args.preco_ate) || 0;
      const fmt = (arr: { title: string; price: number | null; attributes: unknown }[]) =>
        arr.map((i) => `- ${i.title}${i.price ? ` — R$ ${i.price.toLocaleString("pt-BR")}` : ""}${i.attributes ? ` (${Object.entries(i.attributes as object).map(([k, v]) => `${k}: ${v}`).join(", ")})` : ""}`).join("\n");
      const sel = { title: true, price: true, attributes: true } as const;

      // Busca por FAIXA DE PREÇO (lead deu orçamento) — com fallback pros mais próximos.
      if (precoDe || precoAte) {
        const priceWhere: { gte?: number; lte?: number } = {};
        if (precoDe) priceWhere.gte = precoDe;
        if (precoAte) priceWhere.lte = precoAte;
        const inRange = await prisma.catalogItem.findMany({ where: { clientId: ctx.clientId, available: true, price: priceWhere }, orderBy: { price: "asc" }, take: 6, select: sel });
        if (inRange.length) return { result: `Na faixa pedida:\n${fmt(inRange)}\nSe o lead pedir fotos, use enviar_foto.`, decision: "respondeu_duvida" };
        // Nada na faixa → oferece os MAIS EM CONTA disponíveis (o mais próximo do orçamento).
        const closest = await prisma.catalogItem.findMany({ where: { clientId: ctx.clientId, available: true, price: { not: null } }, orderBy: { price: "asc" }, take: 4, select: sel });
        if (!closest.length) return { result: "Catálogo sem itens com preço; não invente, encaminhe ao vendedor.", decision: "respondeu_duvida" };
        return { result: `NÃO há carro exatamente nessa faixa. Em vez de só dizer "não temos", OFEREÇA com simpatia os mais em conta que temos (modelo + preço) e pergunte se algum interessa:\n${fmt(closest)}`, decision: "respondeu_duvida" };
      }

      // Busca por MODELO/termo.
      const items = await searchCatalog(ctx.clientId, termo);
      if (items.length === 0) {
        const total = await prisma.catalogItem.count({ where: { clientId: ctx.clientId, available: true } });
        return { result: total === 0 ? "Catálogo ainda não cadastrado. Não invente produtos: ofereça encaminhar para um vendedor." : `Nenhum item para "${termo}". Se o lead deu um orçamento/faixa, chame buscar_estoque com preco_ate/preco_de pra oferecer o mais próximo.`, decision: "respondeu_duvida" };
      }
      // Várias unidades do mesmo modelo → resume as cores disponíveis e PROÍBE negar uma
      // cor que existe (bug real: IA dizia "não temos preto" tendo 2 pretos no estoque).
      let multi = "";
      if (items.length > 1) {
        const cores = [...new Set(items.map((i) => { const a = i.attributes as Record<string, unknown> | null; return a && typeof a.cor === "string" ? a.cor : null; }).filter(Boolean))];
        if (cores.length > 1) multi = `\nSÃO ${items.length} unidades deste modelo — cores disponíveis: ${cores.join(", ")}. Se o lead pedir uma dessas cores/versões, ela EXISTE: ofereça ESSA unidade e mande a foto DELA. NUNCA diga que não tem uma cor que está nesta lista.`;
      }
      return { result: `Itens disponíveis (disponibilidade final confirmada pelo vendedor):\n${fmt(items)}${multi}\nSe o lead pedir fotos ou ver por dentro, use enviar_foto (você mesma manda as fotos, não o vendedor).`, decision: "respondeu_duvida" };
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
        wantsFinancing: typeof args.quer_financiamento === "boolean" ? args.quer_financiamento : (finDetalhe ? true : (args.forma_pagamento === "financiado" ? true : args.forma_pagamento === "avista" ? false : undefined)),
        financingDetail: finDetalhe,
        paymentMethod: ["avista", "financiado", "indeciso"].includes(String(args.forma_pagamento)) ? String(args.forma_pagamento) : undefined,
        downPayment: (args.entrada as string) || undefined,
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

      // Classificação automática no funil pela AUTORIDADE única (avanço-only; respeita
      // trava manual, terminais e exclusão de donos — antes a escrita direta pulava a manual).
      await applyProfileStage({
        connectionId: ctx.connectionId, contactId: ctx.contactId, clientId: ctx.clientId,
        profileStage: funnelStageFor(prof),
      });

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
      // Anti-reenvio (determinístico, à prova de prompt): só manda foto quando FAZ SENTIDO —
      // no 1º contato, quando o lead PEDE (foto/ver/por dentro/mais) ou quando ele MENCIONA um
      // modelo agora. No meio do orçamento a IA às vezes rechama enviar_foto (foto duplicada);
      // aqui a gente barra, a menos que o lead tenha pedido de fato.
      const inboundN = (ctx.inboundText ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      const pedeFoto = /foto|imagem|\bver\b|\bvejo\b|mostr|por dentro|interior|de novo|outra|mais/.test(inboundN);
      const explicitArg = args.interior === true || Number(args.quantidade) > 1;
      const termToks = term.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
      const mencionaModelo = termToks.some((t) => inboundN.includes(t));
      if (!ctx.isFirstTurn && !pedeFoto && !explicitArg && !mencionaModelo) {
        return { result: "A foto desse modelo já apareceu na conversa e o lead NÃO pediu para ver agora — NÃO reenvie imagem. Siga só com o texto/orçamento." };
      }
      // Busca robusta (tokens + fuzzy) — casa "Taos Highline" mesmo com "1.4" no meio do título.
      const matches = await searchCatalog(ctx.clientId, term);
      const item = (matches.find((i) => i.imageUrl) ?? matches[0]) as (typeof matches)[number] & { images?: string[] } | undefined;
      // Lista de fotos: capa + galeria, sem duplicar. Quantidade limitada (1 na abertura, até 3 sob pedido).
      const gallery = Array.isArray(item?.images) ? item!.images : [];
      const photos = [...new Set([item?.imageUrl, ...gallery].filter(Boolean))] as string[];
      if (!photos.length) return { result: "Sem foto desse veículo no sistema. NÃO prometa que o vendedor envia a foto — em modo assistência isso é caso de [SKIP] (não responda); no fluxo normal, siga por texto com os dados que você tem." };
      const interior = args.interior === true;
      const qtd = Math.max(1, Math.min(5, Number(args.quantidade) || (interior ? 4 : 1)));
      // Interior: as fotos internas ficam no FINAL da galeria (as externas vêm primeiro).
      const toSend = interior && photos.length > qtd ? photos.slice(-qtd) : photos.slice(0, qtd);
      if (ctx.mode === "test") return {
        result: `${toSend.length} foto(s) de ${item!.title} enviada(s) ao lead. Comente CURTINHO (ex: "te mandei uma foto dela 😊") e PARE — não reenvie.`,
        artifacts: toSend.map((u) => ({ kind: "image" as const, url: u, caption: item!.title })),
      };

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
      const restante = photos.length - okCount;
      const maisFotos = restante > 0
        ? `Se o lead pedir MAIS fotos ou ver POR DENTRO/interior, chame enviar_foto de novo com quantidade 5 (a loja tem mais fotos deste carro) — você mesma manda, NÃO diga que o vendedor envia.`
        : `Já enviou as fotos que a loja tem deste carro; se pedir ainda mais, diga que o vendedor pode enviar outras.`;
      return { result: `${okCount} foto(s) de ${item!.title} enviada(s). Comente CURTINHO (ex: "te mandei umas fotos dele 😊") e PARE — NÃO emende pergunta tipo "quer saber mais algum detalhe?"; deixe o lead ver e reagir. ${maisFotos} Não reenvie as MESMAS fotos sem o lead pedir.` };
    }

    // ── Vídeo de apresentação (1º contato) ─────────────────────────────────────
    case "enviar_video": {
      const vcfg = await prisma.aiAgentConfig.findUnique({ where: { clientId: ctx.clientId }, select: { presentationVideoUrl: true, presentationVideoIntro: true } });
      const url = vcfg?.presentationVideoUrl?.trim();
      if (!url) return { result: "Sem vídeo de apresentação configurado — siga a conversa normalmente." };
      // Texto de anúncio ENVIADO ANTES do vídeo (fica natural: "vou te enviar um vídeo..."
      // → vídeo). O `content` que a IA gera junto da tool call é descartado, então o anúncio
      // sai daqui, não do modelo. Configurável por cliente; padrão genérico se vazio.
      const intro = vcfg?.presentationVideoIntro?.trim() || "Vou lhe enviar um vídeo bem curtinho pra você conhecer um pouco mais sobre a gente 😊";
      // Trava anti-reenvio que vale no TESTE também (via histórico da conversa).
      if (ctx.videoAlreadySent) return { result: "O vídeo de apresentação JÁ foi enviado nesta conversa — NÃO reenvie. Só siga a conversa." };
      // ORDEM DO FLUXO: o vídeo SÓ vai DEPOIS de perguntar "primeiro contato?" e o cliente
      // responder. Sem isso a IA dispara o vídeo cedo (cliente abre com "qual o preço da
      // gourmet") e a pergunta de primeiro-contato sai DEPOIS do vídeo — invertido. Só no
      // live (em test não há WaMessage; a ordem é validada pelo próprio transcript).
      if (ctx.mode !== "test") {
        const askedFirst = await prisma.waMessage.findFirst({
          where: { contactId: ctx.contactId, direction: "out", text: { contains: "primeiro contato", mode: "insensitive" } },
          select: { id: true },
        });
        if (!askedFirst) return { result: "AINDA NÃO envie o vídeo. Primeiro PERGUNTE (sem mais nada junto): \"Você já esteve em nossa loja alguma vez ou é o primeiro contato conosco?\" e ESPERE a resposta. Só chame enviar_video DEPOIS que o cliente confirmar que é o primeiro contato." };
      }
      if (ctx.mode === "test") return {
        result: `Anúncio ("${intro}") e vídeo de apresentação enviados ao lead. NÃO diga que mandou um vídeo nem repita o anúncio — siga direto com UMA pergunta leve (ex.: o nome). NÃO envie o vídeo de novo nesta conversa.`,
        artifacts: [{ kind: "video", url, caption: "Apresentação" }],
      };
      // Trava dura: o vídeo de apresentação vai UMA vez só por contato. Se já mandamos,
      // não reenvia (independe do que a IA decida).
      const jaEnviou = await prisma.waMessage.findFirst({ where: { contactId: ctx.contactId, direction: "out", type: "video", aiGenerated: true }, select: { id: true } });
      if (jaEnviou) return { result: "O vídeo de apresentação JÁ foi enviado a este cliente — NÃO reenvie. Siga a conversa normalmente." };
      const conn = await prisma.waConnection.findUnique({ where: { id: ctx.connectionId }, select: { phoneNumberId: true, accessToken: true } });
      if (!conn) return { result: "Conexão indisponível para enviar o vídeo." };
      // 1) Anúncio (texto) primeiro — pra o cliente saber que vem um vídeo.
      const introSent = await sendWhatsAppText(conn, ctx.contactWaId, intro);
      if (introSent.ok) await prisma.waMessage.create({ data: {
        connectionId: ctx.connectionId, contactId: ctx.contactId, waMessageId: introSent.waMessageId || `ia-vidintro-${Date.now()}`,
        direction: "out", type: "text", text: intro, aiGenerated: true, timestamp: new Date(),
      } }).catch(() => {});
      // 2) Vídeo em seguida.
      const sent = await sendWhatsAppVideo(conn, ctx.contactWaId, url);
      if (!sent.ok) return { result: `Não consegui enviar o vídeo (${sent.error}); siga a conversa por texto.` };
      await prisma.waMessage.create({ data: {
        connectionId: ctx.connectionId, contactId: ctx.contactId, waMessageId: sent.waMessageId || `ia-vid-${Date.now()}`,
        direction: "out", type: "video", text: "[vídeo de apresentação]", aiGenerated: true, timestamp: new Date(),
      } }).catch(() => {});
      return { result: "Anúncio + vídeo de apresentação já enviados ao lead. NÃO diga que mandou um vídeo nem repita o anúncio — siga DIRETO pra próxima etapa da conversa (ex.: perguntar o nome, conforme o fluxo)." };
    }
    case "enviar_catalogo": {
      const categoria = String(args.categoria ?? "").toLowerCase() === "lareira" ? "lareira" : "churrasqueira";
      // Churrasqueiras: AiAgentConfig.catalogPdfUrl. Lareiras: PricingConfig.rules.lareirasPdfUrl.
      let url: string | undefined;
      if (categoria === "lareira") {
        const pc = await prisma.pricingConfig.findFirst({ where: { clientId: ctx.clientId }, select: { rules: true } });
        url = ((pc?.rules as { lareirasPdfUrl?: string } | null)?.lareirasPdfUrl ?? "").trim() || undefined;
      } else {
        const ccfg = await prisma.aiAgentConfig.findUnique({ where: { clientId: ctx.clientId }, select: { catalogPdfUrl: true } });
        url = ccfg?.catalogPdfUrl?.trim() || undefined;
      }
      const nome = categoria === "lareira" ? "lareiras" : "churrasqueiras";
      if (!url) return { result: `Sem catálogo de ${nome} em PDF configurado — apresente os modelos por texto e ofereça a foto de cada um (enviar_foto).` };
      const marker = `[catálogo de ${nome} em PDF]`;
      // Cada catálogo vai UMA vez por conversa (por categoria).
      if (ctx.mode !== "test") {
        const ja = await prisma.waMessage.findFirst({ where: { contactId: ctx.contactId, direction: "out", type: "document", aiGenerated: true, text: marker }, select: { id: true } });
        if (ja) return { result: `O catálogo de ${nome} JÁ foi enviado nesta conversa — NÃO reenvie. Se ele quiser um modelo específico, use enviar_foto.` };
      }
      const cap = `Nosso catálogo de ${nome} 🔥`;
      if (ctx.mode === "test") return { result: `Catálogo de ${nome} (PDF) enviado ao lead. Comente CURTINHO (ex.: 'te mandei nosso catálogo 😊') e pergunte se algum modelo chamou a atenção.`, artifacts: [{ kind: "pdf", url, caption: cap }] };
      const conn = await prisma.waConnection.findUnique({ where: { id: ctx.connectionId }, select: { phoneNumberId: true, accessToken: true } });
      if (!conn) return { result: "Conexão indisponível para enviar o catálogo." };
      const sent = await sendWhatsAppDocumentByUrl(conn, ctx.contactWaId, { url, filename: `Catalogo ${nome} JR Churrasqueiras.pdf`, caption: cap });
      if (!sent.ok) return { result: `Não consegui enviar o catálogo (${sent.error}); apresente os modelos por texto e ofereça a foto de cada um.` };
      await prisma.waMessage.create({ data: {
        connectionId: ctx.connectionId, contactId: ctx.contactId, waMessageId: sent.waMessageId || `ia-cat-${Date.now()}`,
        direction: "out", type: "document", text: marker, aiGenerated: true, timestamp: new Date(),
      } }).catch(() => {});
      return { result: `Catálogo de ${nome} em PDF enviado. Comente CURTINHO (ex.: 'te mandei nosso catálogo 😊') e pergunte se algum modelo chamou a atenção. NÃO reenvie o catálogo.` };
    }

    case "pedir_localizacao": {
      const cidade = typeof (args as { cidade?: string }).cidade === "string" ? (args as { cidade?: string }).cidade!.trim() : "";
      const body = `Pra calcular o frete certinho da sua região${cidade ? ` em ${cidade}` : ""}, toca no botão abaixo e compartilha sua localização 📍\n\nSe preferir, é só me mandar seu bairro/endereço por escrito 😊`;
      if (ctx.mode === "test") return {
        result: "Pedido de localização enviado ao lead (no WhatsApp aparece o botão 'Enviar localização'). Aguarde ele compartilhar a localização (ou mandar o endereço por texto) e então gere o orçamento — não escolha a zona por conta própria.",
        artifacts: [{ kind: "location_request", caption: body }],
      };
      const conn = await prisma.waConnection.findUnique({ where: { id: ctx.connectionId }, select: { phoneNumberId: true, accessToken: true } });
      if (!conn) return { result: "Conexão indisponível — peça a cidade/bairro por texto." };
      const sent = await sendWhatsAppLocationRequest(conn, ctx.contactWaId, body);
      if (!sent.ok) return { result: `Não consegui enviar o pedido de localização (${sent.error}); peça o bairro/endereço por texto.` };
      await prisma.waMessage.create({ data: {
        connectionId: ctx.connectionId, contactId: ctx.contactId, waMessageId: sent.waMessageId || `ia-loc-${Date.now()}`,
        direction: "out", type: "interactive", text: "[pedido de localização]", aiGenerated: true, timestamp: new Date(),
      } }).catch(() => {});
      return { result: "Pedido de localização enviado. AGUARDE o cliente compartilhar (ou mandar o endereço por texto). Quando vier, você recebe o bairro/cidade — aí é só gerar o orçamento. NÃO repita o pedido; não escolha a zona por conta própria." };
    }

    case "reagir": {
      const emoji = typeof (args as { emoji?: string }).emoji === "string" ? (args as { emoji?: string }).emoji! : "";
      if (!emoji) return { result: "Sem emoji — siga a conversa normalmente." };
      if (ctx.mode === "test") return { result: `(reagiu com ${emoji} na mensagem do lead) Siga a conversa normalmente — não comente a reação.` };
      // Reage à última mensagem RECEBIDA do lead.
      const lastIn = await prisma.waMessage.findFirst({ where: { contactId: ctx.contactId, direction: "in" }, orderBy: { timestamp: "desc" }, select: { waMessageId: true } });
      if (!lastIn?.waMessageId) return { result: "Não há mensagem recente do lead para reagir — siga normalmente." };
      const conn = await prisma.waConnection.findUnique({ where: { id: ctx.connectionId }, select: { phoneNumberId: true, accessToken: true } });
      if (!conn) return { result: "Conexão indisponível — siga a conversa normalmente." };
      await sendWhatsAppReaction(conn, ctx.contactWaId, lastIn.waMessageId, emoji).catch(() => {});
      return { result: `Reagiu com ${emoji}. NÃO comente a reação nem repita o emoji no texto — siga a conversa com naturalidade (ou nem responda, se já estava tudo dito).` };
    }

    case "enviar_localizacao_loja": {
      const pcL = await prisma.pricingConfig.findUnique({ where: { clientId: ctx.clientId }, select: { rules: true } });
      const company = (pcL?.rules as { company?: { address?: string; city?: string } } | null)?.company;
      const addr = [company?.address, company?.city].filter((s): s is string => !!s && s.trim().length > 0).join(", ");
      if (!addr) return { result: "Endereço da loja não cadastrado — não invente; se o lead perguntar, diga que confirma com o vendedor." };
      if (ctx.mode === "test") return { result: `(enviaria o PIN da loja no mapa: ${addr}). Comente curtinho que mandou a localização.`, artifacts: [{ kind: "location_request", caption: addr }] };
      const geo = await geocodeAddress(addr);
      if (!geo) return { result: `Não consegui montar o mapa agora — passe o endereço por texto ao lead: ${addr}` };
      const conn = await prisma.waConnection.findUnique({ where: { id: ctx.connectionId }, select: { phoneNumberId: true, accessToken: true } });
      if (!conn) return { result: `Conexão indisponível — passe o endereço por texto: ${addr}` };
      const cli = await prisma.client.findUnique({ where: { id: ctx.clientId }, select: { name: true } });
      const sent = await sendWhatsAppLocation(conn, ctx.contactWaId, { latitude: geo.lat, longitude: geo.lng, name: cli?.name ?? "Loja", address: addr });
      if (!sent.ok) return { result: `Não consegui enviar o mapa (${sent.error}); passe o endereço por texto: ${addr}` };
      await prisma.waMessage.create({ data: {
        connectionId: ctx.connectionId, contactId: ctx.contactId, waMessageId: sent.waMessageId || `ia-loc-loja-${Date.now()}`,
        direction: "out", type: "location", text: `[localização da loja: ${addr}]`, aiGenerated: true, timestamp: new Date(),
      } }).catch(() => {});
      return { result: "Localização da loja enviada no mapa. Comente curtinho (ex: 'te mandei nossa localização 📍, é só tocar pra abrir no mapa') e siga." };
    }

    case "enviar_opcionais": {
      const ocfg = await prisma.aiAgentConfig.findUnique({ where: { clientId: ctx.clientId }, select: { optionsImageUrl: true } });
      const url = ocfg?.optionsImageUrl?.trim();
      if (!url) return { result: "Sem imagem de opcionais configurada — descreva os opcionais por texto." };
      if (ctx.mode === "test") return { result: "Imagem dos opcionais enviada ao lead. Comente CURTINHO (ex: 'te mandei a imagem com os acessórios 😊') e siga.", artifacts: [{ kind: "image", url, caption: "Opcionais" }] };
      const conn = await prisma.waConnection.findUnique({ where: { id: ctx.connectionId }, select: { phoneNumberId: true, accessToken: true } });
      if (!conn) return { result: "Conexão indisponível para enviar a imagem." };
      const sent = await sendWhatsAppImage(conn, ctx.contactWaId, url, "Acessórios");
      if (!sent.ok) return { result: `Não consegui enviar a imagem (${sent.error}); descreva os opcionais por texto.` };
      await prisma.waMessage.create({ data: {
        connectionId: ctx.connectionId, contactId: ctx.contactId, waMessageId: sent.waMessageId || `ia-opc-${Date.now()}`,
        direction: "out", type: "image", text: "[imagem dos opcionais]", aiGenerated: true, timestamp: new Date(),
      } }).catch(() => {});
      return { result: "Imagem dos opcionais enviada. Comente CURTINHO (ex: 'te mandei a imagem com os acessórios 😊') e siga." };
    }

    case "escalar_humano": {
      return { result: "Ok, o vendedor já foi acionado. Diga ao lead, de forma natural, que um VENDEDOR VAI ENTRAR EM CONTATO pra dar sequência — NUNCA diga 'vou chamar um vendedor' (isso soa como se tivesse alguém disponível na hora). Siga o STATUS DA LOJA: se ABERTA, 'o vendedor já vai entrar em contato'; se FECHADA, 'no próximo horário comercial'. NÃO prometa horário exato. Nada de gíria (sem 'kkk').", decision: "escalou" };
    }

    // ── Orçamento: coleta de ficha ─────────────────────────────────────────────
    case "atualizar_ficha": {
      const spec = parseSpec(ctx.intakeSpec);
      if (!spec.length) return { result: "Nenhuma ficha configurada para este cliente." };
      const { data, invalidOptions } = sanitizeIntake(spec, (args.campos as Record<string, unknown>) ?? {});
      const invalT = invalidOptions.length ? ` Valores inválidos (ignorados): ${invalidOptions.join(", ")}.` : "";
      if (ctx.mode === "test") {
        // Acumula na ficha efêmera (não grava) p/ o gerar_orcamento enxergar o coletado.
        if (!ctx.testFicha) ctx.testFicha = {};
        Object.assign(ctx.testFicha, data);
        const missT = missingRequired(spec, ctx.testFicha);
        return { result: `(teste) Ficha: ${summarizeIntake(spec, ctx.testFicha) || "nada ainda"}.${invalT}${missT.length ? ` Ainda falta: ${missT.map((f) => f.label).join(", ")}.` : " Ficha COMPLETA — chame gerar_orcamento agora, não reconfirme."}` };
      }
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

    // ── Orçamento: preço determinístico (nunca inventado) ──────────────────────
    case "gerar_orcamento": {
      const pc = await prisma.pricingConfig.findUnique({ where: { clientId: ctx.clientId } });
      if (!pc) return { result: "Sem tabela de preço configurada. Não invente valores: encaminhe para um vendedor." };
      const rules = pc.rules as unknown as PricingRules;

      const acesso = args.acesso as { lances?: number; tipo?: string; elevador?: boolean } | undefined;
      const sel = {
        base: (args.base as string[]) ?? [], options: (args.opcionais as string[]) ?? [], quantities: (args.quantidades as Record<string, number>) ?? undefined,
        montagem: args.montagem === true,
        cash: args.pagamento === "dinheiro",
        access: acesso ? { flights: acesso.lances, spiral: acesso.tipo === "caracol", elevator: acesso.elevador === true } : undefined,
      };
      // Trava 1: sem MODELO (base) não orça.
      if (!sel.base.length) return { result: "Escolha ao menos um MODELO (base) para orçar. Pergunte ao lead qual modelo ele quer." };

      // Trava 2: campos obrigatórios da ficha (ex.: endereço, modelo) precisam estar coletados.
      // Em teste a ficha vive só na memória da run (ctx.testFicha) — atualizar_ficha não grava.
      const spec = parseSpec(ctx.intakeSpec);
      const ficha: IntakeData = ctx.mode === "test"
        ? (ctx.testFicha ?? {})
        : (((await prisma.leadProfile.findUnique({ where: { contactId: ctx.contactId } }))?.data as IntakeData) ?? {});
      const missing = missingRequired(spec, ficha);
      if (missing.length) return { result: `Ainda NÃO posso gerar o orçamento — colete antes (use atualizar_ficha): ${missing.map((f) => f.label).join(", ")}.` };

      const retirada = args.retirada === true;
      const r = computeQuote(rules, sel);
      if (!r.ok) return { result: `Chaves inválidas: ${r.unknownKeys.join(", ")}. Use SOMENTE as chaves do catálogo:\n${describeRules(rules)}` };
      let q = r.quote;
      let notaExtra = ""; // avisos p/ a IA (ex.: montagem obrigatória já incluída)

      // RETIRADA na fábrica → SEM frete (o vendedor vê que é retirada e dá sequência).
      if (retirada) notaExtra += " RETIRADA na fábrica — orçamento SEM frete. Ao fechar, o vendedor combina o dia da retirada.";
      // Frete determinístico pela REGIÃO do endereço coletado (blob da ficha). Só quando
      // NÃO é retirada. Resolução cidade→zona: bairro conhecido resolve direto; cidade
      // com várias zonas e nenhuma identificada → a IA pergunta a zona (nunca chuta).
      if (!retirada && rules.freight?.length) {
        // GATE de divergência: se o cliente compartilhou uma localização (GPS) cuja CIDADE
        // difere da que ele informou, o frete sairia errado. Avisa (humano) e pede o endereço
        // por escrito — NÃO orça, NÃO re-pede o pin. Limpa o GPS (não confiável) pra não
        // re-disparar quando ele corrigir por escrito. (O modelo sozinho loopava aqui.)
        const statedCity = String(ficha.cidade_entrega ?? ficha.cidade ?? "").trim();
        const gpsCity = String(ficha.localizacao_gps ?? "").split(",").pop()?.trim() ?? "";
        if (statedCity && gpsCity && citiesDiffer(statedCity, gpsCity)) {
          if (ctx.mode === "test") { if (ctx.testFicha) delete (ctx.testFicha as Record<string, unknown>).localizacao_gps; }
          else {
            const nf = { ...(ficha as Record<string, unknown>) }; delete nf.localizacao_gps;
            await prisma.leadProfile.update({ where: { contactId: ctx.contactId }, data: { data: nf as object } }).catch(() => {});
          }
          return { result: `A LOCALIZAÇÃO que o cliente compartilhou é de ${gpsCity}, mas ele informou a entrega em ${statedCity}. NÃO gere orçamento e NÃO peça a localização de novo (pedir_localizacao). Avise de um jeito humano que a localização NÃO corresponde à cidade que ele informou e peça o ENDEREÇO COMPLETO POR ESCRITO (cidade, bairro e rua). Ex.: "Opa, a localização que você mandou é de ${gpsCity}, mas você tinha me falado ${statedCity} 😊 — me manda o endereço completo por escrito pra eu acertar o frete certinho?". Só volte a orçar quando ele mandar o endereço/bairro por escrito.` };
        }
        // Endereço p/ resolver a zona = valores da ficha + as ÚLTIMAS mensagens do lead.
        // O bairro/endereço que o cliente digita nem sempre vira campo da ficha (o modelo
        // não salva sempre); sem isso o motor só enxerga a CIDADE e trava no loop de "qual
        // zona?" mesmo o cliente tendo dito o bairro. Ler o que ele ESCREVEU torna a
        // resolução determinística — o nome do bairro casa a zona (ex.: "Moinhos de Vento"
        // → Central). Só no modo live (em test não há WaMessage; usa a ficha efêmera).
        const fichaBlob = Object.values(ficha).filter((v): v is string => typeof v === "string").join(" ");
        let inboundBlob = "";
        if (ctx.mode !== "test") {
          const recent = await prisma.waMessage.findMany({
            where: { contactId: ctx.contactId, direction: "in" },
            orderBy: { timestamp: "desc" }, take: 8, select: { text: true },
          });
          inboundBlob = recent.map((m) => (m.text || "").trim()).filter((t) => t && !t.startsWith("[")).join(" ");
        }
        const addressBlob = `${fichaBlob} ${inboundBlob}`.trim();
        const fr = resolveFreight(rules, addressBlob);
        if (fr && "unmatched" in fr) {
          const temEndereco = addressBlob.trim().length > 0;
          if (temEndereco) return { result: "A cidade do lead NÃO está na nossa área de entrega/montagem própria. Envie ESTA mensagem (mantendo o conteúdo): \"Para a sua localidade enviamos via transportadora ou podes retirar direto conosco com frete particular, reboque/camionete. Para realizar a cotação com a transportadora irei precisar de alguns dados: Nome completo, CPF, CEP com endereço da entrega\". Colete Nome/CPF/CEP (atualizar_ficha) e use aprovar_orcamento p/ o vendedor cotar a transportadora. NÃO invente valor de transportadora." };
          return { result: "Ainda não sei a cidade de entrega. Pergunte a cidade do lead (atualizar_ficha) e gere de novo." };
        }
        if (fr && "askZone" in fr) {
          const opts = fr.options.map((o) => `${o.zone || o.region}: ${brl(o.amount, pc.currency)}${o.assembly === "required" ? " (com montagem obrigatória)" : ""}`).join("; ");
          return { result: `A cidade ${fr.city} tem zonas com fretes diferentes: ${opts}. Peça a LOCALIZAÇÃO do cliente com pedir_localizacao (jeito mais fácil e certeiro de achar a zona) — ou, se ele preferir, o BAIRRO por texto. Registre na ficha (atualizar_ficha) e gere o orçamento de novo. NÃO escolha a zona por conta própria; se mesmo assim não casar, use escalar_humano.` };
        }
        if (fr) {
          // Regra JR: zona com montagem OBRIGATÓRIA (assembly required OU frete acima do
          // limite) → a montagem entra SOZINHA, sem perguntar ao lead.
          const thr = rules.policies?.freightAssemblyThreshold;
          const montagemObrigatoria = fr.assembly === "required" || (thr != null && fr.amount > thr);
          if (montagemObrigatoria && !sel.montagem) {
            const r2 = computeQuote(rules, { ...sel, montagem: true });
            if (r2.ok) { q = r2.quote; notaExtra += " Nessa região a MONTAGEM é OBRIGATÓRIA — já incluí no orçamento. NÃO pergunte se o lead quer montagem; se comentar, diga apenas que a entrega já vai com a montagem inclusa."; }
          }
          // TRAVA determinística: com MONTAGEM, o ACESSO é obrigatório (afeta o preço). Se
          // ainda não foi coletado, NÃO fecha o orçamento — a IA pergunta primeiro.
          const montagemAplica = sel.montagem || montagemObrigatoria;
          if (montagemAplica && !acesso) {
            return { result: "AINDA NÃO feche o orçamento: como vai COM MONTAGEM, preciso do ACESSO do local. Pergunte ao lead, de forma leve: \"é térreo, tem escada (quantos lances? é tradicional ou caracol) ou é por elevador?\" e passe em 'acesso' (térreo = { lances: 0 }). Depois gere o orçamento de novo." };
          }
          q = appendFeeLine(q, fr);
        }
      }

      // Guarda de sanidade: nunca envia orçamento com total inválido (erro de cadastro).
      if (!q.items.length || q.total <= 0) {
        return { result: "Orçamento com total inválido (R$ 0 ou vazio) — provável erro no cadastro de preço. NÃO envie valor; peça pro lead aguardar que um vendedor confirma o valor certo." };
      }
      // Parcela SEM JUROS (só se o cliente configurou rules.installments) — grounded: a IA
      // pode falar porque saiu daqui (do motor), não da cabeça dela.
      const parcela = installmentsLabel(q.total, pc.currency, (pc.rules as { installments?: number })?.installments);
      const parcelaLinha = parcela ? `\nParcelamento: ${parcela}.` : "";
      const summary = q.items.map((i) => i.label).join(", ");
      const linhas = q.items.map((i) => `- ${i.label}: ${brl(i.amount, pc.currency)}`).join("\n");
      // Modo teste devolve as LINHAS (não só o total): senão o grounding derruba o
      // detalhamento do orçamento no Console (preço de item "sem fonte"). Espelha o live.
      if (ctx.mode === "test") {
        // Console: gera o PDF de verdade como artefato (o cliente vê o documento como no
        // WhatsApp). O número é só ilustrativo (test não grava Quote).
        const lastN = await prisma.quote.findFirst({ where: { clientId: ctx.clientId }, orderBy: { number: "desc" }, select: { number: true } });
        const num = (lastN?.number ?? 0) + 1;
        const cidade = typeof ficha.cidade_entrega === "string" ? ficha.cidade_entrega : null;
        // Nome que o cliente informou na conversa (ficha) tem prioridade sobre o nome do contato.
        const nome = typeof ficha.nome === "string" && ficha.nome.trim() ? ficha.nome.trim() : ctx.contactName;
        const art = await quotePdfArtifact(ctx.clientId, q, pc.currency, nome, num, cidade);
        return {
          result: `Orçamento montado e PDF enviado ao lead:\n${linhas}\nTotal: ${brl(q.total, pc.currency)}.${parcelaLinha}\nComente o total (pode mencionar o parcelamento se houver), diga que enviou o PDF e ofereça tirar dúvidas ou seguir pra fechar.${notaExtra}`,
          decision: "orcou",
          artifacts: art ? [art] : undefined,
        };
      }
      const last = await prisma.quote.findFirst({ where: { clientId: ctx.clientId }, orderBy: { number: "desc" }, select: { number: true } });
      const number = (last?.number ?? 0) + 1;
      await prisma.quote.create({ data: {
        clientId: ctx.clientId, contactId: ctx.contactId, number,
        items: q.items as unknown as Prisma.InputJsonValue, subtotal: q.subtotal, fees: q.fees, total: q.total,
        currency: pc.currency, status: "draft", summary, intake: (ficha as unknown as Prisma.InputJsonValue) ?? undefined,
      } });
      return { result: `Orçamento Nº ${number} gerado (fonte oficial de preço):\n${linhas}\nTotal: ${brl(q.total, pc.currency)}.${parcelaLinha}\nApresente ao lead e pergunte se pode enviar o PDF.${notaExtra}`, decision: "orcou" };
    }

    // ── Orçamento: envia o PDF pelo WhatsApp ───────────────────────────────────
    case "enviar_orcamento": {
      // No modo teste o PDF já foi exibido junto do gerar_orcamento (test não grava Quote).
      if (ctx.mode === "test") return { result: "(teste) O PDF do orçamento já foi enviado ao lead. Confirme que chegou e ofereça seguir pra fechar.", decision: "orcou" };
      const quote = args.quoteId
        ? await prisma.quote.findFirst({ where: { id: String(args.quoteId), clientId: ctx.clientId } })
        : await prisma.quote.findFirst({ where: { clientId: ctx.clientId, contactId: ctx.contactId, status: "draft" }, orderBy: { createdAt: "desc" } });
      if (!quote) {
        // Já pode ter ido pra revisão (não é mais "draft") — não trate como erro nem gere outro.
        const pend = await prisma.quote.findFirst({ where: { clientId: ctx.clientId, contactId: ctx.contactId, status: "pending_review" }, orderBy: { createdAt: "desc" } });
        if (pend) return { result: "O orçamento já está sendo finalizado pela nossa equipe. Tranquilize o lead: você está confirmando tudo e já envia o PDF — não gere outro orçamento.", decision: "orcou" };
        return { result: "Nenhum orçamento encontrado para enviar. Gere um com gerar_orcamento." };
      }

      // ── Modo revisão do vendedor: NÃO envia o PDF — coloca na fila de revisão ─────
      // O PDF só vai ao lead depois que um vendedor aprovar na fila (blinda o preço).
      if (ctx.quoteReview) {
        await prisma.quote.update({ where: { id: quote.id }, data: { status: "pending_review", submittedAt: new Date() } });
        await pushPortalReview(ctx.clientId, `Orçamento Nº ${quote.number} — ${brl(quote.total, quote.currency)} — aguarda seu aval.`).catch(() => {});
        return {
          result: `Orçamento Nº ${quote.number} enviado para CONFERÊNCIA da equipe (revisão antes do envio). NÃO diga que já mandou o PDF. Diga ao lead, natural, que você está finalizando/conferindo os valores e já envia o orçamento em PDF em instantes — sem prometer horário exato. Depois é só aguardar o lead.`,
          decision: "orcou",
        };
      }
      const conn = await prisma.waConnection.findUnique({ where: { id: ctx.connectionId }, select: { phoneNumberId: true, accessToken: true } });
      if (!conn) return { result: "Conexão de WhatsApp indisponível para envio." };
      const fichaIntake = quote.intake as IntakeData | null;
      const fichaCidade = fichaIntake?.cidade_entrega;
      const fichaNome = fichaIntake?.nome;
      try {
        const pdf = await renderQuotePdf(await buildQuoteDocData(
          ctx.clientId,
          quote.items as unknown as QuoteLineIn[],
          quote.total, quote.currency,
          typeof fichaNome === "string" && fichaNome.trim() ? fichaNome.trim() : ctx.contactName,
          quote.number,
          typeof fichaCidade === "string" ? fichaCidade : null,
        ));
        const sent = await sendWhatsAppDocument(conn, ctx.contactWaId, { buffer: pdf, filename: `orcamento-${quote.number}.pdf`, caption: `Orçamento Nº ${quote.number}` });
        if (!sent.ok) return { result: `Falha ao enviar o PDF: ${sent.error}. Ofereça tentar de novo ou chamar um vendedor.` };
        await prisma.quote.update({ where: { id: quote.id }, data: { status: "sent" } });
        await prisma.waMessage.create({ data: {
          connectionId: ctx.connectionId, contactId: ctx.contactId, waMessageId: sent.waMessageId || `ia-doc-${Date.now()}`,
          direction: "out", type: "document", text: `[orçamento Nº ${quote.number}]`, aiGenerated: true, timestamp: new Date(),
        } }).catch(() => {});
        return { result: `Orçamento Nº ${quote.number} enviado ao lead em PDF. Confirme o recebimento e tire dúvidas.`, decision: "orcou" };
      } catch (e) {
        return { result: `Não consegui gerar/enviar o PDF (${String(e).slice(0, 80)}). Ofereça chamar um vendedor.` };
      }
    }

    // ── Orçamento aprovado → aciona vendedor (reusa o escalation da master) ─────
    case "aprovar_orcamento": {
      const quote = args.quoteId
        ? await prisma.quote.findFirst({ where: { id: String(args.quoteId), clientId: ctx.clientId } })
        : await prisma.quote.findFirst({ where: { clientId: ctx.clientId, contactId: ctx.contactId }, orderBy: { createdAt: "desc" } });
      if (ctx.mode === "test") return { result: "(teste) Acionaria o vendedor (orçamento aprovado).", decision: "escalou" };
      const detalhe = quote ? ` Orçamento Nº ${quote.number} — ${brl(quote.total, quote.currency)}.` : "";
      await createEscalationTask({
        clientId: ctx.clientId, contactId: ctx.contactId, contactName: ctx.contactName, waId: ctx.contactWaId,
        reason: `Orçamento aprovado / quer fechar: ${String(args.motivo ?? "")}.${detalhe}`, kind: "handoff",
      }).catch(() => {});
      if (quote) await prisma.quote.update({ where: { id: quote.id }, data: { status: "approved" } }).catch(() => {});
      // Sinal para a FILA DE FECHAMENTO: o lead entra na fila dos vendedores (portal).
      await prisma.waConversation.update({ where: { contactId: ctx.contactId }, data: { quoteApprovedAt: new Date() } }).catch(() => {});
      await pushPortalFechamento(ctx.clientId, `${ctx.contactName || "Um lead"} aprovou o orçamento${detalhe} Quer fechar.`).catch(() => {});
      return { result: "Vendedor acionado com o orçamento aprovado. Diga ao lead que um VENDEDOR VAI ENTRAR EM CONTATO pra fechar. Não prometa horário exato.", decision: "escalou" };
    }

    default:
      return { result: "Ferramenta desconhecida." };
  }
}
