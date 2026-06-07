// Cliente reutilizável do Groq (chat). Mesma infra usada na análise de reuniões.
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

export class GroqError extends Error {}

export async function groqChat(system: string, user: string, maxTokens = 800): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new GroqError("GROQ_API_KEY não configurada");

  // Tenta 1 retry no rate limit (janela de 1 min).
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
      return data.choices[0]?.message?.content ?? "";
    }
    if (res.status === 429 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 62000));
      continue;
    }
    throw new GroqError(await res.text());
  }
  return "";
}

// Extrai o 1º objeto JSON de uma resposta da IA (que às vezes vem com texto ao redor).
export function extractJson<T>(raw: string): T | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
}
