// ── Chain-of-verification por LLM (F1, opcional) ─────────────────────────────
// Segunda passada: um modelo confere se cada afirmação factual da resposta está
// embasada nas FONTES (ferramentas + conhecimento). Complementa o grounding
// determinístico para casos que regex não pega (ex: atributos, disponibilidade,
// características do produto). Custa uma chamada extra — por isso é OPT-IN por
// cliente (AiAgentConfig.verifyReplies). Desligado, o fluxo segue igual a hoje.

import { openaiChat } from "@/lib/openai";

export interface VerifyResult {
  ok: boolean;
  unsupported: string[];
  /** Itens que o modelo apontou mas que NÃO vieram da resposta (ver `daResposta`). */
  descartados?: string[];
}

// ── Filtro determinístico contra falso positivo ──────────────────────────────
// MEDIDO: o auditor aponta como "não apoiada" uma frase que estava nas FONTES —
// tipicamente a fala do PRÓPRIO LEAD, que entra nas fontes junto com o histórico.
// Chegou a barrar uma resposta que era só "Que legal! Fico à disposição". Em
// produção barrar significa ABSTER, então falso positivo cala o atendimento numa
// resposta correta — pior que o problema que o auditor veio resolver.
//
// Reescrever o prompt NÃO resolveu (mesma falha, mesmo item). Então a decisão sai
// da mão do modelo: cada item é atribuído ao texto de onde ele veio. Se se parece
// mais com as fontes do que com a resposta, não é afirmação do atendente.
//
// Comparação por palavras de conteúdo, não substring, para tolerar a paráfrase
// que o modelo às vezes faz ao citar.
const palavras = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .split(/[^a-z0-9]+/).filter((w) => w.length > 3);

function cobertura(item: string, texto: string): number {
  const alvo = new Set(palavras(texto));
  const ws = palavras(item);
  if (!ws.length) return 0;
  return ws.filter((w) => alvo.has(w)).length / ws.length;
}

/** O item apontado saiu da RESPOSTA (e não das fontes)? */
export function daResposta(item: string, reply: string, sources: string): boolean {
  const naResposta = cobertura(item, reply);
  if (naResposta < 0.6) return false;            // nem está na resposta
  return naResposta >= cobertura(item, sources); // empate fica com a resposta
}

// As duas primeiras regras existem por FALHA MEDIDA: num ensaio com casos reais,
// o auditor listou como "não apoiada" uma frase que estava nas FONTES — a fala do
// próprio lead — e barrou até uma resposta que era só cordialidade. Em produção
// isso vira abstenção ("prefiro confirmar com um vendedor") em resposta boa.
// As fontes carregam o histórico da conversa, então elas CONTÊM o que o lead
// falou; especulação do lead não é afirmação do atendente.
const VERIFY_SYSTEM = `Você audita a RESPOSTA de um atendente virtual antes de enviá-la ao lead.
Receberá as FONTES (únicas verdades permitidas) e a RESPOSTA.

REGRAS OBRIGATÓRIAS:
1. Cada item que você listar DEVE ser um trecho LITERAL da RESPOSTA. Nunca liste
   frase que apareça nas FONTES — as fontes incluem o histórico da conversa, e o
   que o LEAD disse ou supôs NÃO é afirmação do atendente.
2. Se a RESPOSTA não contém nenhuma afirmação factual — só cordialidade, pergunta,
   agradecimento ou generalidade — retorne lista VAZIA. Nunca invente item.
3. Na dúvida, NÃO liste: um falso alarme cala o atendimento numa resposta correta.

Liste apenas as afirmações FACTUAIS e VERIFICÁVEIS da RESPOSTA (preço, prazo,
disponibilidade, característica do produto, capacidade de fabricação, política)
que NÃO estejam apoiadas nas fontes.
Responda ESTRITAMENTE em JSON: {"unsupported": ["trecho literal da resposta", ...]}.`;

export async function verifyReply(opts: {
  model: string;
  sources: string;
  reply: string;
  clientId?: string;
}): Promise<VerifyResult> {
  // Sem fontes não há o que conferir factualmente — evita falso positivo.
  if (!opts.sources.trim()) return { ok: true, unsupported: [] };

  try {
    const { message } = await openaiChat({
      model: opts.model,
      temperature: 0,
      maxTokens: 250,
      messages: [
        { role: "system", content: VERIFY_SYSTEM },
        { role: "user", content: `FONTES:\n${opts.sources}\n\nRESPOSTA:\n${opts.reply}` },
      ],
      meta: { clientId: opts.clientId, pipeline: "judge", tenantKey: opts.clientId },
    });
    const raw = message.content ?? "";
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json) as { unsupported?: unknown };
    const apontados = Array.isArray(parsed.unsupported)
      ? parsed.unsupported.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : [];
    const unsupported = apontados.filter((i) => daResposta(i, opts.reply, opts.sources));
    const descartados = apontados.filter((i) => !unsupported.includes(i));
    return { ok: unsupported.length === 0, unsupported, descartados };
  } catch {
    // Falha do verificador não pode derrubar o atendimento: deixa passar (o
    // grounding determinístico e o guardrail de saída seguem valendo).
    return { ok: true, unsupported: [] };
  }
}
