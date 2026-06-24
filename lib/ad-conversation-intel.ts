import { prisma } from "@/lib/prisma";
import { groqChat, extractJson } from "@/lib/groq";

// ── Inteligência de criativo a partir das CONVERSAS REAIS ────────────────────
// O diferencial: cruza o anúncio (ad_id) com as conversas reais dos leads que ele
// gerou (WhatsApp) e devolve o que o comprador de verdade pergunta/objeta e uma
// recomendação de copy/criativo/oferta. A contagem de temas é DETERMINÍSTICA
// (sem achismo); a leitura/recomendação é da IA — com fallback se não houver chave.

// Temas do lead automotivo (uma mensagem pode bater em vários). 1 ponto de verdade.
const INTENTS: { key: string; label: string; re: RegExp }[] = [
  { key: "preco", label: "Preço / valor", re: /(pre[çc]o|valor|quanto (custa|sai|fica|ta|e|por)|tabela|a vista|fipe)/i },
  { key: "financiamento", label: "Financiamento / parcela", re: /(financ|parcel|entrada|simula|presta[çc]|\bbanco\b|credito|consorcio|carne|\bcnh\b|score|nome (sujo|limpo)|\bcpf\b)/i },
  { key: "troca", label: "Troca na negociação", re: /(troca|dou (na|de) troca|aceita.*troca|na troca|meu carro (na|de)? ?troca)/i },
  { key: "disponibilidade", label: "Ainda disponível?", re: /(ainda (tem|ta|esta|disponivel|a venda)|disponivel|ja vendeu|foi vendido|tem esse)/i },
  { key: "ficha", label: "Ficha (ano/km/itens)", re: /(\bano\b|\bkm\b|quilometr|\bmotor\b|c[âa]mbio|automatic|\bmanual\b|completo|ipva|unico dono|revis|\bpneu|\bcor\b|\bflex\b|diesel|teto solar|\bcouro\b|multimidia)/i },
  { key: "visita", label: "Visita / test drive", re: /(visita|ver de perto|test ?drive|agendar|passar a[íi]|conhecer|olhar pessoalmente|dar uma olhada)/i },
  { key: "local", label: "Localização / horário", re: /(onde (fica|esta|e|voces)|endereco|localiza|que horas|horario|esta aberto|abre|atende|qual cidade)/i },
  { key: "negociar", label: "Desconto / negociação", re: /(desconto|melhor pre[çc]o|ultimo pre[çc]o|abaixa|faz por|consegue por|baixa o)/i },
];

export interface IntentCount { key: string; label: string; count: number; pct: number }
export interface AdConversationIntel {
  leadCount: number;
  messageCount: number;
  intents: IntentCount[];                 // temas ordenados por frequência (determinístico)
  topOpeners: string[];                   // exemplos reais de abertura (prova)
  ai: {
    perguntas: string[];
    objecoes: string[];
    qualidade: string;
    recomendacao: string;
    source: "ai" | "fallback";
  } | null;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

export interface AdSignals { leadCount: number; messageCount: number; intents: IntentCount[]; topOpeners: string[] }

// Sinais DETERMINÍSTICOS das conversas do anúncio (sem IA) — reutilizado pela
// análise e pelo gerador de anúncio.
export async function gatherAdSignals(
  clientId: string,
  opts: { adId?: string | null; adModel?: string | null },
  start: Date,
  end: Date,
): Promise<AdSignals> {
  const empty: AdSignals = { leadCount: 0, messageCount: 0, intents: [], topOpeners: [] };
  const wa = await prisma.waConnection.findUnique({ where: { clientId }, select: { id: true } });
  if (!wa) return empty;

  // Leads atribuídos a ESTE anúncio (por ad_id; cai para o modelo se não houver id).
  const where = opts.adId
    ? { connectionId: wa.id, adId: opts.adId, enteredAt: { gte: start, lt: end } }
    : opts.adModel
      ? { connectionId: wa.id, adModel: opts.adModel, enteredAt: { gte: start, lt: end } }
      : null;
  if (!where) return empty;

  const leads = await prisma.waLead.findMany({ where, select: { contactId: true } });
  if (leads.length === 0) return empty;
  const contactIds = leads.map((l) => l.contactId);

  const msgs = await prisma.waMessage.findMany({
    where: { contactId: { in: contactIds }, direction: "in", type: "text", text: { not: null } },
    select: { contactId: true, text: true, timestamp: true },
    orderBy: { timestamp: "asc" },
  });

  // Contagem determinística de temas + 1ª mensagem (abertura) por contato.
  const tally = new Map<string, Set<string>>(); // intent → contatos que tocaram nele
  const opener = new Map<string, string>();
  for (const m of msgs) {
    const t = norm(m.text ?? "");
    if (!opener.has(m.contactId) && (m.text ?? "").trim().length > 1) opener.set(m.contactId, m.text!.trim());
    for (const it of INTENTS) {
      if (it.re.test(t)) {
        const set = tally.get(it.key) ?? new Set<string>();
        set.add(m.contactId);
        tally.set(it.key, set);
      }
    }
  }
  const leadCount = leads.length;
  const intents: IntentCount[] = INTENTS
    .map((it) => ({ key: it.key, label: it.label, count: tally.get(it.key)?.size ?? 0 }))
    .filter((i) => i.count > 0)
    .map((i) => ({ ...i, pct: Math.round((i.count / leadCount) * 100) }))
    .sort((a, b) => b.count - a.count);

  const topOpeners = [...opener.values()].map((s) => s.replace(/\s+/g, " ").slice(0, 160)).slice(0, 25);

  return { leadCount, messageCount: msgs.length, intents, topOpeners };
}

// Inteligência completa: sinais determinísticos + leitura/recomendação da IA.
export async function analyzeAdConversations(
  clientId: string,
  opts: { adId?: string | null; adModel?: string | null },
  start: Date,
  end: Date,
): Promise<AdConversationIntel> {
  const sig = await gatherAdSignals(clientId, opts, start, end);
  return { ...sig, ai: sig.leadCount > 0 ? await buildAiReading(sig.intents, sig.topOpeners, sig.leadCount) : null };
}

// Leitura/recomendação da IA — estritamente a partir dos temas + aberturas reais.
async function buildAiReading(intents: IntentCount[], openers: string[], leadCount: number): Promise<AdConversationIntel["ai"]> {
  const topLabels = intents.slice(0, 3).map((i) => `${i.label} (${i.pct}%)`).join(", ");
  const fallback = {
    perguntas: intents.slice(0, 4).map((i) => i.label),
    objecoes: [] as string[],
    qualidade: leadCount > 0 ? `${leadCount} lead(s); temas mais frequentes: ${topLabels || "—"}.` : "Sem conversas no período.",
    recomendacao: intents[0]
      ? `Os leads perguntam muito sobre "${intents[0].label}". Destaque isso no criativo/copy do anúncio.`
      : "Ainda sem volume de conversa para recomendar ajustes.",
    source: "fallback" as const,
  };
  if (!process.env.GROQ_API_KEY || leadCount === 0 || openers.length === 0) return fallback;

  const system =
    "Você é um gestor de tráfego e vendas de revenda de veículos. Analise as mensagens REAIS dos leads que vieram de UM anúncio e responda SOMENTE com base nelas. Devolva um JSON com as chaves: perguntas (array de strings curtas — o que mais perguntam), objecoes (array — hesitações/objeções), qualidade (1 frase sobre a qualidade/intenção dos leads), recomendacao (1-2 frases objetivas de ajuste de copy/criativo/oferta do anúncio). Português do Brasil, direto, sem inventar nada que não esteja nas mensagens.";
  const user = [
    `Temas detectados (determinístico): ${intents.map((i) => `${i.label}=${i.count}`).join(", ") || "nenhum"}.`,
    `Mensagens de abertura dos leads (${openers.length}):`,
    ...openers.map((o, i) => `${i + 1}. ${o}`),
  ].join("\n");

  try {
    const raw = await groqChat(system, user, 380);
    const parsed = extractJson<{ perguntas?: string[]; objecoes?: string[]; qualidade?: string; recomendacao?: string }>(raw);
    if (!parsed || !parsed.recomendacao) return fallback;
    return {
      perguntas: Array.isArray(parsed.perguntas) ? parsed.perguntas.slice(0, 6) : fallback.perguntas,
      objecoes: Array.isArray(parsed.objecoes) ? parsed.objecoes.slice(0, 6) : [],
      qualidade: parsed.qualidade?.trim() || fallback.qualidade,
      recomendacao: parsed.recomendacao.trim(),
      source: "ai",
    };
  } catch {
    return fallback;
  }
}
