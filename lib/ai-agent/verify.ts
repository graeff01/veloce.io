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
}

const VERIFY_SYSTEM = `Você audita a resposta de um atendente virtual antes de enviá-la ao lead.
Receberá as FONTES (únicas verdades permitidas) e a RESPOSTA.
Liste as afirmações FACTUAIS e VERIFICÁVEIS da resposta (preço, prazo, disponibilidade,
característica do produto, política) que NÃO estejam apoiadas nas fontes. Ignore cordialidades,
perguntas e generalidades. Se tudo estiver apoiado, retorne lista vazia.
Responda ESTRITAMENTE em JSON: {"unsupported": ["afirmação 1", ...]}.`;

export async function verifyReply(opts: {
  model: string;
  sources: string;
  reply: string;
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
    });
    const raw = message.content ?? "";
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json) as { unsupported?: unknown };
    const unsupported = Array.isArray(parsed.unsupported)
      ? parsed.unsupported.filter((x): x is string => typeof x === "string")
      : [];
    return { ok: unsupported.length === 0, unsupported };
  } catch {
    // Falha do verificador não pode derrubar o atendimento: deixa passar (o
    // grounding determinístico e o guardrail de saída seguem valendo).
    return { ok: true, unsupported: [] };
  }
}
