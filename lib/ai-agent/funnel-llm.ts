import { openaiChat } from "@/lib/openai";
import { extractJson } from "@/lib/groq";

// ── Classificador de funil por LLM (lê CONTEXTO, não a mensagem isolada) ────────
// Raiz dos erros do léxico: ler palavra solta sem contexto ("não tenho interesse
// agora" sobe o lead porque vê "interesse"). Aqui a LLM lê uma JANELA das últimas N
// mensagens e devolve estrutura fixa com CONFIANÇA — quem decide o avanço aplica o
// gate (≥ threshold) por cima. Best-effort e OFF-PATH: timeout duro, nunca lança;
// falha/timeout → null (o chamador cai no piso determinístico).

const MODEL = process.env.FUNNEL_LLM_MODEL || "gpt-4o-mini";
const TIMEOUT_MS = Number(process.env.FUNNEL_LLM_TIMEOUT_MS || 4000);

export type LlmStage = "recebido" | "respondido" | "qualificado" | "negociacao" | "perdido" | "nenhum";
// Temperatura em EN (compatível com LeadProfile.temperature já existente).
export type LlmTemp = "hot" | "warm" | "cold";

export interface FunnelSignals {
  interesse: boolean;        // demonstra interesse concreto no produto
  orcamento: boolean;        // revelou faixa de valor / condição de pagamento própria
  intencao_visita: boolean;  // quer ver de perto / agendar / test-drive
}

export interface FunnelVerdict {
  etapa: LlmStage;
  confianca: number;          // 0..100 (inteiro)
  evidencia: string | null;   // frase do lead que justifica a etapa
  sinais: FunnelSignals;
  // Temperatura (mesma chamada — a LLM já leu a janela): quão perto de comprar AGORA.
  temperatura: LlmTemp | null;    // null = não deu pra inferir
  confiancaTemp: number;          // 0..100
  evidenciaTemp: string | null;   // frase que justifica a temperatura
  // Telemetria (preenchida pelo chamador para o log de shadow):
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  model: string;
}

export interface FunnelWindowMsg { text: string | null; direction: string }

const STAGES: LlmStage[] = ["recebido", "respondido", "qualificado", "negociacao", "perdido", "nenhum"];
// Mapa PT (saída da LLM) → EN (armazenado). "nenhum" → null.
const TEMP_MAP: Record<string, LlmTemp> = { quente: "hot", morno: "warm", frio: "cold" };

const SYSTEM = `Você é um classificador de FUNIL DE VENDAS por WhatsApp. Recebe a JANELA das últimas
mensagens de uma conversa (LEAD = cliente; LOJA = vendedor/assistente) e decide em qual etapa o LEAD está.

Etapas (do topo do funil para o fundo):
- "recebido": o lead escreveu, mas ainda não há sinal de interesse concreto.
- "respondido": houve troca, mas sem qualificação (só saudação, dúvida vaga, "oi", "tudo bem?").
- "qualificado": interesse CONCRETO do lead — pergunta preço/ano/km/cor/estado, pede foto/vídeo,
  disponibilidade, condição de pagamento, ou quer visitar/agendar/test-drive.
- "negociacao": o lead negocia de fato — desconto/valor final, troca do veículo dele, financiamento/
  parcelamento/entrada, ou sinaliza fechar ("vou levar", "quero esse", "pode reservar").
- "perdido": o lead DESISTE ou perde interesse — "não tenho interesse", "já comprei em outro",
  "deixa pra lá", "não quero mais".

REGRAS CRÍTICAS (a confiança do cliente depende disso):
1. Use o CONTEXTO, nunca palavras isoladas. "não tenho interesse agora" é PERDIDO/RECUADO, não
   qualificação — mesmo contendo a palavra "interesse". Negações e ironia importam.
2. Só classifique acima de "respondido" se houver EVIDÊNCIA EXPLÍCITA na fala do LEAD (ignore o que
   a LOJA ofereceu). Na dúvida, prefira a etapa MENOR e confiança baixa.
3. NUNCA classifique "convertido" (venda) — isso é decisão humana, fora do seu escopo.
4. "evidencia" = a frase curta do LEAD que justifica a etapa (ou null se recebido/respondido).
5. "confianca" reflete o quanto a evidência é inequívoca (0..100). Ambíguo = confiança baixa.

Além da etapa, avalie a TEMPERATURA do lead — quão perto ele está de comprar AGORA (independe da etapa):
- "quente": urgência/intenção real de fechar logo — quer visitar hoje, "posso passar aí", "quero fechar",
  pergunta entrada/parcela pra decidir, prazo curto.
- "morno": interesse genuíno mas sem urgência — pesquisando, comparando, "vou pensar", sem data.
- "frio": pouco engajado, sumindo, respostas curtas/evasivas, "depois eu vejo", sem sinal de compra.
- "nenhum": não dá pra inferir.
"evidencia_temp" = a frase que justifica a temperatura. "confianca_temp" = 0..100.`;

function transcript(window: FunnelWindowMsg[]): string {
  return window
    .filter((m) => m.text && m.text.trim())
    .map((m) => `${m.direction === "out" ? "LOJA" : "LEAD"}: ${m.text!.slice(0, 300)}`)
    .join("\n")
    .slice(-3500);
}

interface RawVerdict {
  etapa?: unknown; confianca?: unknown; evidencia?: unknown; sinais?: unknown;
  temperatura?: unknown; confianca_temp?: unknown; evidencia_temp?: unknown;
}

function clampConf(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  // aceita 0..1 ou 0..100
  const scaled = n > 0 && n <= 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(scaled)));
}

function bool(v: unknown): boolean {
  return v === true || v === "true" || v === 1;
}

function cleanPhrase(v: unknown): string | null {
  return typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "null" ? v.trim().slice(0, 200) : null;
}

// Classifica a janela. Retorna null em falta de chave / timeout / erro / JSON inválido.
export async function classifyFunnelLLM(opts: {
  window: FunnelWindowMsg[];
  clientId: string;
  vertical?: string | null;
  currentStage?: string | null;
}): Promise<FunnelVerdict | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const convo = transcript(opts.window);
  if (convo.length < 3) return null;

  const vert = opts.vertical ? `Segmento da loja: ${opts.vertical}.\n` : "";
  const user =
    `${vert}Etapa atual registrada: ${opts.currentStage || "nenhuma"}.\n\n` +
    `Janela da conversa (mais recente por último):\n${convo}\n\n` +
    `Responda SÓ JSON: {"etapa":"recebido|respondido|qualificado|negociacao|perdido|nenhum",` +
    `"confianca":0..100,"evidencia":"frase do lead ou null",` +
    `"sinais":{"interesse":bool,"orcamento":bool,"intencao_visita":bool},` +
    `"temperatura":"quente|morno|frio|nenhum","confianca_temp":0..100,"evidencia_temp":"frase ou null"}`;

  const t0 = Date.now();
  let res: Awaited<ReturnType<typeof openaiChat>> | null = null;
  try {
    res = await Promise.race([
      openaiChat({
        model: MODEL,
        temperature: 0,
        maxTokens: 230,
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }],
        meta: { clientId: opts.clientId, pipeline: "intelligence", tenantKey: opts.clientId },
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
    ]);
  } catch {
    return null; // erro de rede/limite → chamador cai no piso
  }
  if (!res) return null; // timeout

  const j = extractJson<RawVerdict>(res.message.content ?? "");
  if (!j) return null;
  const etapa = (STAGES as string[]).includes(String(j.etapa)) ? (j.etapa as LlmStage) : "nenhum";
  const s = (j.sinais ?? {}) as Record<string, unknown>;

  return {
    etapa,
    confianca: clampConf(j.confianca),
    evidencia: cleanPhrase(j.evidencia),
    sinais: { interesse: bool(s.interesse), orcamento: bool(s.orcamento), intencao_visita: bool(s.intencao_visita) },
    temperatura: TEMP_MAP[String(j.temperatura).toLowerCase()] ?? null,
    confiancaTemp: clampConf(j.confianca_temp),
    evidenciaTemp: cleanPhrase(j.evidencia_temp),
    latencyMs: Date.now() - t0,
    tokensIn: res.usage.prompt_tokens,
    tokensOut: res.usage.completion_tokens,
    model: MODEL,
  };
}
