// Integração com a OpenAI (motor do Veloce AI Agent). Modelo padrão: gpt-4o-mini.
import { withLLMLimits } from "@/lib/ai-agent/llm-limiter";
import { recordUsage, type Pipeline } from "@/lib/ai-agent/usage";

const OPENAI_URL = "https://api.openai.com/v1";

export class OpenAIError extends Error {}

// Atribuição de uso/limite por chamada (opcional; quando ausente, só não mede custo).
export interface LLMMeta { clientId?: string; pipeline?: Pipeline; tenantKey?: string }

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

// Conteúdo multimodal (texto + imagem) para o turno do usuário (vision).
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[] | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatResult {
  message: { role: "assistant"; content: string | null; tool_calls?: ToolCall[] };
  usage: { prompt_tokens: number; completion_tokens: number };
}

export async function openaiChat(opts: {
  model?: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  temperature?: number;
  maxTokens?: number;
  meta?: LLMMeta;
}): Promise<ChatResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new OpenAIError("OPENAI_API_KEY não configurada");
  const model = opts.model ?? "gpt-4o-mini";

  const result = await withLLMLimits(opts.meta?.tenantKey ?? opts.meta?.clientId, async () => {
    const res = await fetch(`${OPENAI_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, messages: opts.messages,
        ...(opts.tools?.length ? { tools: opts.tools, tool_choice: "auto" } : {}),
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 600,
      }),
    });
    if (!res.ok) throw new OpenAIError(`OpenAI ${res.status}: ${await res.text()}`);
    return res.json();
  });

  const usage = result.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
  if (opts.meta?.pipeline) {
    void recordUsage({ clientId: opts.meta.clientId, pipeline: opts.meta.pipeline, model, tokensIn: usage.prompt_tokens, tokensOut: usage.completion_tokens });
  }
  return { message: result.choices?.[0]?.message ?? { role: "assistant", content: null }, usage };
}

// Embeddings para o RAG do conhecimento (text-embedding-3-small).
export async function embed(texts: string[], meta?: LLMMeta): Promise<number[][]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new OpenAIError("OPENAI_API_KEY não configurada");
  if (texts.length === 0) return [];

  const data = await withLLMLimits(meta?.tenantKey ?? meta?.clientId, async () => {
    const res = await fetch(`${OPENAI_URL}/embeddings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input: texts }),
    });
    if (!res.ok) throw new OpenAIError(`OpenAI embeddings ${res.status}: ${await res.text()}`);
    return res.json();
  });
  if (meta?.clientId) {
    void recordUsage({ clientId: meta.clientId, pipeline: "embedding", model: "text-embedding-3-small", tokensIn: data.usage?.total_tokens ?? 0, tokensOut: 0 });
  }
  return (data.data ?? []).map((d: { embedding: number[] }) => d.embedding);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
