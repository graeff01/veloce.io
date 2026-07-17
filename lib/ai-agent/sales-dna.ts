import { prisma } from "@/lib/prisma";
import { openaiChat } from "@/lib/openai";

// ── "Clonar o melhor vendedor" ────────────────────────────────────────────────
// Estuda as conversas que FECHARAM (venda confirmada), atendidas por um vendedor
// HUMANO, e destila o "DNA de venda" — o jeito concreto do melhor vendedor conduzir e
// fechar. Esse DNA é injetado no prompt da IA (quando ligado), pra ela vender no mesmo
// estilo. É o diferencial que um chatbot alugado nunca terá: aprende com o SEU time.

const MAX_CONVOS = 20;       // conversas campeãs no corpus
const MAX_MSGS_PER_CONVO = 22;
const MAX_CHARS_PER_MSG = 320;

export interface WinningStats { conversations: number; vendors: { email: string; wins: number }[]; totalRevenue: number }

// Conversas boas pra aprender: venda confirmada, OU o lead PROGREDIU no funil (o vendedor
// realmente trabalhou). Funciona tanto no painel (assignedEmail) quanto em COEXISTÊNCIA
// (vendedor responde pelo celular — sem dono/sentByEmail; o sinal é o avanço do funil).
async function findWinningContactIds(clientId: string): Promise<{ contactId: string; assignedEmail: string | null; saleValue: number | null }[]> {
  const conns = await prisma.waConnection.findMany({ where: { clientId }, select: { id: true } });
  const connIds = conns.map((c) => c.id);
  if (!connIds.length) return [];
  return prisma.waConversation.findMany({
    where: {
      connectionId: { in: connIds },
      OR: [
        { saleConfirmedAt: { not: null } },
        { funnelStage: { in: ["convertido", "negociacao", "qualificado"] } },
      ],
    },
    orderBy: [{ saleConfirmedAt: "desc" }, { lastMessageAt: "desc" }],
    take: 200,
    select: { contactId: true, assignedEmail: true, saleValue: true },
  });
}

export async function winningStats(clientId: string): Promise<WinningStats> {
  const rows = await findWinningContactIds(clientId);
  const byVendor = new Map<string, number>();
  let totalRevenue = 0;
  for (const r of rows) {
    if (r.assignedEmail) byVendor.set(r.assignedEmail, (byVendor.get(r.assignedEmail) ?? 0) + 1);
    if (r.saleValue) totalRevenue += r.saleValue;
  }
  const vendors = [...byVendor.entries()].map(([email, wins]) => ({ email, wins })).sort((a, b) => b.wins - a.wins);
  return { conversations: rows.length, vendors, totalRevenue };
}

// Monta o corpus: transcrições das conversas campeãs, marcando a linha do VENDEDOR.
async function buildCorpus(clientId: string): Promise<{ corpus: string; used: number }> {
  const winners = await findWinningContactIds(clientId);
  // Prioriza conversas com MAIS mensagens do vendedor humano (mais "venda" pra aprender).
  const contactIds = winners.map((w) => w.contactId);
  if (!contactIds.length) return { corpus: "", used: 0 };

  const blocks: { text: string; humanOut: number }[] = [];
  for (const cid of contactIds) {
    const msgs = await prisma.waMessage.findMany({
      where: { contactId: cid, text: { not: null } },
      orderBy: { timestamp: "asc" },
      select: { direction: true, text: true, aiGenerated: true, sentByEmail: true },
      take: 80,
    });
    if (!msgs.length) continue;
    const trimmed = msgs.slice(-MAX_MSGS_PER_CONVO);
    let humanOut = 0;
    const lines = trimmed.map((m) => {
      const t = (m.text ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_CHARS_PER_MSG);
      if (!t) return null;
      if (m.direction === "in") return `Cliente: ${t}`;
      // Saída NÃO gerada pela IA = vendedor humano (painel: sentByEmail; coexistência: pelo celular).
      if (!m.aiGenerated) { humanOut++; return `VENDEDOR: ${t}`; }
      return `IA: ${t}`;
    }).filter(Boolean);
    if (humanOut >= 2) blocks.push({ text: lines.join("\n"), humanOut }); // só conversas onde o humano realmente vendeu
  }
  // As mais ricas em diálogo do vendedor primeiro.
  blocks.sort((a, b) => b.humanOut - a.humanOut);
  const chosen = blocks.slice(0, MAX_CONVOS);
  const corpus = chosen.map((b, i) => `### Venda ${i + 1}\n${b.text}`).join("\n\n");
  return { corpus, used: chosen.length };
}

const SYSTEM = `Você é um analista de vendas sênior. Vai estudar conversas REAIS de WhatsApp que RESULTARAM EM VENDA e destilar o "DNA de venda" do vendedor — o jeito concreto como ele conduz e fecha. O resultado será usado por uma assistente de IA para vender no MESMO estilo, então precisa ser CONCRETO e acionável, não genérico.

Regras:
- Baseie-se APENAS nas conversas fornecidas. Se um padrão não aparece nelas, não invente.
- Use exemplos e frases REAIS tiradas das conversas (entre aspas).
- Escreva em segunda pessoa, no imperativo, como instruções que a IA vai seguir ("Faça...", "Quando o cliente disser X, responda...").
- Seja específico do NEGÓCIO (produtos, objeções e gatilhos que apareceram), não conselho de venda genérico.
- NÃO copie dados sensíveis (nomes, telefones). Foque no MÉTODO.`;

const USER_INSTRUCTIONS = `Extraia o DNA de venda em tópicos curtos e diretos, nesta estrutura:

ABERTURA — como o vendedor puxa a conversa e cria conexão.
DESCOBERTA — como ele entende o que o cliente quer sem parecer interrogatório.
APRESENTAÇÃO & PREÇO — como fala do produto e apresenta/defende o valor.
OBJEÇÕES — padrões concretos de resposta ("tá caro", "vou pensar", hesitação, comparação). Dê o gatilho → a resposta que funcionou.
FECHAMENTO — como e QUANDO ele fecha; que frase/gesto empurra pro sim.
BORDÕES QUE FUNCIONAM — expressões e frases reais dele que convém a IA usar.
EVITE — o que NÃO fazer (se aparecer algum padrão que trava a venda).

Máximo ~700 palavras. Direto, prático, no estilo de um manual interno do melhor vendedor da casa.`;

// Destila o DNA e salva em AiAgentConfig.salesDna (não liga sozinho — salesDnaEnabled fica a cargo do usuário).
export async function distillSalesDna(clientId: string): Promise<{ ok: boolean; dna?: string; used?: number; error?: string }> {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
  const { corpus, used } = await buildCorpus(clientId);
  if (used < 3) return { ok: false, error: `Poucas vendas com diálogo de vendedor para aprender (${used}). Precisa de pelo menos 3 conversas fechadas atendidas por um vendedor.` };

  const res = await openaiChat({
    model: "gpt-4.1-mini",
    temperature: 0.3,
    maxTokens: 1600,
    meta: { clientId, pipeline: "intelligence" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Empresa: ${client?.name ?? "a loja"}.\n\nConversas que fecharam (${used}):\n\n${corpus}\n\n---\n${USER_INSTRUCTIONS}` },
    ],
  });
  const dna = (res.message.content ?? "").trim();
  if (!dna) return { ok: false, error: "A destilação não retornou conteúdo. Tente de novo." };

  await prisma.aiAgentConfig.update({ where: { clientId }, data: { salesDna: dna, salesDnaAt: new Date() } }).catch(() => {});
  return { ok: true, dna, used };
}

// Bloco de prompt com o DNA (injetado no atendimento quando salesDnaEnabled).
export function salesDnaBlock(dna: string | null | undefined): string {
  if (!dna || !dna.trim()) return "";
  return `ESTILO DE VENDA DA CASA — destilado dos atendimentos REAIS que FECHARAM (o jeito do melhor vendedor daqui). Incorpore este método com naturalidade, sem soar decorado; ele tem PRIORIDADE sobre instruções genéricas de venda, mas NUNCA sobre os LIMITES/segurança nem sobre a política de preço (você continua não inventando valor):\n${dna.trim()}`;
}
